/*
 * Sovereign Sensor — Phase 1 Main Application
 *
 * Three-thread architecture:
 *   1. Sensor thread (P5): reads IMU at configured rate, pushes to ring buffer
 *   2. Capture thread (P3): state machine — IDLE → ARMED → CAPTURING → TRANSFER
 *   3. Transport thread (P7): drains ring buffer over USB CDC as CSV
 *
 * Phase 1: threshold-based swing detection, USB CSV output.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include "sensor_config.h"
#include "capture.h"
#include "transport.h"
#include "protocol.h"

LOG_MODULE_REGISTER(main, LOG_LEVEL_INF);

/* Thread stacks */
#define SENSOR_STACK_SIZE   2048
#define CAPTURE_STACK_SIZE  2048
#define TRANSPORT_STACK_SIZE 2048

K_THREAD_STACK_DEFINE(sensor_stack, SENSOR_STACK_SIZE);
K_THREAD_STACK_DEFINE(capture_stack, CAPTURE_STACK_SIZE);
K_THREAD_STACK_DEFINE(transport_stack, TRANSPORT_STACK_SIZE);

static struct k_thread sensor_thread_data;
static struct k_thread capture_thread_data;
static struct k_thread transport_thread_data;

/* Shared state */
static volatile enum capture_state current_state = CAPTURE_STATE_IDLE;
static volatile bool transfer_requested = false;
static struct sensor_runtime_config runtime_config = {
    .sample_rate_hz = DEFAULT_SAMPLE_RATE_HZ,
    .wake_threshold_mg = DEFAULT_WAKE_THRESHOLD_MG,
    .capture_mode = 1,  /* threshold */
    .capture_duration_s = DEFAULT_CAPTURE_DURATION_S,
    .preroll_s = DEFAULT_PREROLL_S,
};

/* Forward declarations */
int imu_init(void);
int imu_set_rate(uint16_t rate_hz);
int imu_read_sample(struct imu_sample *sample);
bool imu_is_ready(void);

/* ---------- Sensor Thread (Priority 5) ---------- */

static void sensor_thread_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1); ARG_UNUSED(p2); ARG_UNUSED(p3);

    struct imu_sample sample;
    uint32_t period_us = 1000000 / runtime_config.sample_rate_hz;

    LOG_INF("Sensor thread started (%u Hz, %u us period)",
            runtime_config.sample_rate_hz, period_us);

    while (1) {
        int64_t start = k_uptime_ticks();

        if (current_state == CAPTURE_STATE_ARMED ||
            current_state == CAPTURE_STATE_CAPTURING ||
            current_state == CAPTURE_STATE_STREAMING) {

            int ret = imu_read_sample(&sample);
            if (ret == 0) {
                ring_buffer_push(&sample);
            }
        }

        /* Precise timing: sleep for remainder of period */
        int64_t elapsed_us = k_ticks_to_us_floor64(k_uptime_ticks() - start);
        if (elapsed_us < period_us) {
            k_usleep(period_us - (uint32_t)elapsed_us);
        }
    }
}

/* ---------- Capture Thread (Priority 3) ---------- */

static void capture_thread_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1); ARG_UNUSED(p2); ARG_UNUSED(p3);

    LOG_INF("Capture thread started (mode=threshold, threshold=%u mg)",
            runtime_config.wake_threshold_mg);

    swing_detect_set_threshold(runtime_config.wake_threshold_mg);
    swing_detect_set_cooldown(DEFAULT_COOLDOWN_S * 1000);

    while (1) {
        switch (current_state) {
        case CAPTURE_STATE_IDLE:
            /* Transition to ARMED — ready to detect swing */
            current_state = CAPTURE_STATE_ARMED;
            ring_buffer_clear();
            swing_detect_reset();
            LOG_INF("State: IDLE → ARMED");
            break;

        case CAPTURE_STATE_ARMED: {
            /* Check latest sample for swing start */
            struct imu_sample sample;
            int count = ring_buffer_count();
            if (count > 0 &&
                ring_buffer_peek(&sample, count - 1) == 0) {
                enum swing_event evt = swing_detect_check(&sample);
                if (evt == SWING_EVENT_START) {
                    session_start();
                    current_state = CAPTURE_STATE_CAPTURING;
                    LOG_INF("State: ARMED → CAPTURING (session %04u)",
                            session_get_id());
                }
            }
            k_msleep(2);  /* Check at 500Hz */
            break;
        }

        case CAPTURE_STATE_CAPTURING: {
            /* Count samples and check for swing end */
            struct imu_sample sample;
            int count = ring_buffer_count();
            if (count > 0 &&
                ring_buffer_peek(&sample, count - 1) == 0) {
                session_add_sample();
                enum swing_event evt = swing_detect_check(&sample);

                /* End on swing end or max duration */
                float duration = session_get_duration_s();
                if (evt == SWING_EVENT_END ||
                    duration >= runtime_config.capture_duration_s) {
                    session_end();
                    current_state = CAPTURE_STATE_TRANSFER;
                    transfer_requested = true;
                    LOG_INF("State: CAPTURING → TRANSFER (%u samples, %.2fs)",
                            session_get_sample_count(), (double)duration);
                }
            }
            k_msleep(2);
            break;
        }

        case CAPTURE_STATE_TRANSFER:
            /* Wait for transport thread to finish draining */
            if (!transfer_requested) {
                current_state = CAPTURE_STATE_IDLE;
                LOG_INF("State: TRANSFER → IDLE");
            }
            k_msleep(10);
            break;

        case CAPTURE_STATE_STREAMING:
            /* Phase 2: continuous streaming mode */
            k_msleep(100);
            break;

        case CAPTURE_STATE_SLEEP:
            k_msleep(1000);
            break;

        default:
            current_state = CAPTURE_STATE_IDLE;
            break;
        }
    }
}

/* ---------- Transport Thread (Priority 7) ---------- */

static void transport_thread_fn(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1); ARG_UNUSED(p2); ARG_UNUSED(p3);

    char line_buf[256];

    LOG_INF("Transport thread started (USB CDC)");

    while (1) {
        if (!transfer_requested || !usb_serial_is_connected()) {
            k_msleep(50);
            continue;
        }

        /* Send CSV header */
        int len = csv_format_header(line_buf, sizeof(line_buf),
                                     "PROTEUS1", runtime_config.sample_rate_hz,
                                     session_get_id(), "threshold");
        if (len > 0) {
            usb_serial_writeln(line_buf);
        }

        /* Drain ring buffer as CSV */
        struct imu_sample sample;
        uint32_t sent = 0;
        while (ring_buffer_pop(&sample) == 0) {
            len = csv_format_sample(line_buf, sizeof(line_buf), &sample);
            if (len > 0) {
                usb_serial_writeln(line_buf);
                sent++;
            }
            /* Yield periodically to avoid starving other threads */
            if ((sent % 64) == 0) {
                k_yield();
            }
        }

        /* Send footer */
        len = csv_format_footer(line_buf, sizeof(line_buf),
                                session_get_id(), sent,
                                session_get_duration_s());
        if (len > 0) {
            usb_serial_writeln(line_buf);
        }

        LOG_INF("Transfer complete: %u samples sent via USB", sent);
        transfer_requested = false;
    }
}

/* ---------- Main ---------- */

int main(void)
{
    LOG_INF("=== Sovereign Sensor v0.1.0 ===");
    LOG_INF("Phase 1: Threshold Capture + USB CSV");

    /* Initialize subsystems */
    int ret = ring_buffer_init();
    if (ret < 0) {
        LOG_ERR("Ring buffer init failed: %d", ret);
        return ret;
    }

    ret = imu_init();
    if (ret < 0) {
        LOG_ERR("IMU init failed: %d", ret);
        return ret;
    }

    ret = usb_serial_init();
    if (ret < 0) {
        LOG_ERR("USB serial init failed: %d", ret);
        /* Continue without USB — sensor still captures */
    }

    /* Start threads */
    k_thread_create(&sensor_thread_data, sensor_stack,
                    K_THREAD_STACK_SIZEOF(sensor_stack),
                    sensor_thread_fn, NULL, NULL, NULL,
                    5, 0, K_NO_WAIT);
    k_thread_name_set(&sensor_thread_data, "sensor");

    k_thread_create(&capture_thread_data, capture_stack,
                    K_THREAD_STACK_SIZEOF(capture_stack),
                    capture_thread_fn, NULL, NULL, NULL,
                    3, 0, K_NO_WAIT);
    k_thread_name_set(&capture_thread_data, "capture");

    k_thread_create(&transport_thread_data, transport_stack,
                    K_THREAD_STACK_SIZEOF(transport_stack),
                    transport_thread_fn, NULL, NULL, NULL,
                    7, 0, K_NO_WAIT);
    k_thread_name_set(&transport_thread_data, "transport");

    LOG_INF("All threads started. Entering IDLE state.");

    /* Main thread becomes idle — could handle shell commands in future */
    while (1) {
        k_msleep(5000);
        if (imu_is_ready()) {
            LOG_INF("Status: state=%s, ring=%d/%d, usb=%s",
                    capture_state_name(current_state),
                    ring_buffer_count(), RING_BUFFER_SAMPLES,
                    usb_serial_is_connected() ? "connected" : "disconnected");
        }
    }

    return 0;
}
