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
#include <zephyr/drivers/gpio.h>
#include <zephyr/logging/log.h>
#include "sensor_config.h"
#include "capture.h"
#include "transport.h"
#include "protocol.h"
#include <stdio.h>

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

/* Forward declarations — ISM330DHCX */
int imu_init(void);
int imu_set_rate(uint16_t rate_hz);
int imu_read_sample(struct imu_sample *sample);
bool imu_is_ready(void);

/* Forward declarations — IIS3DWB impact + environment */
int impact_detect_init(void);
bool impact_is_ready(void);
void impact_arm(void);
void impact_disarm(void);
int impact_capture_sample(void);
bool impact_has_data(void);
uint16_t impact_get_count(void);
uint32_t impact_analyze_peak(void);
int impact_get_sample(uint16_t index, int16_t *x, int16_t *y, int16_t *z);

int environment_init(void);
float environment_read_temperature(void);
bool environment_temp_ready(void);
bool environment_wake_ready(void);

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
                    /* Don't arm IIS3DWB yet — wait for downswing detection */
                    current_state = CAPTURE_STATE_CAPTURING;
                    LOG_INF("State: ARMED → CAPTURING (session %04u)",
                            session_get_id());
                }
            }
            k_msleep(2);  /* Check at 500Hz */
            break;
        }

        case CAPTURE_STATE_CAPTURING: {
            /* Count samples and check for swing events */
            struct imu_sample sample;
            int count = ring_buffer_count();
            if (count > 0 &&
                ring_buffer_peek(&sample, count - 1) == 0) {
                session_add_sample();

                /* Capture impact vibration (no-op if not yet armed) */
                if (impact_is_ready()) {
                    impact_capture_sample();
                }

                enum swing_event evt = swing_detect_check(&sample);

                /* Predictive impact arming via gyroscope */
                if (evt == SWING_EVENT_DOWNSWING) {
                    /* Downswing detected — arm IIS3DWB burst capture */
                    impact_arm();
                    LOG_INF("Downswing → IIS3DWB armed for impact");
                } else if (evt == SWING_EVENT_IMPACT_PREDICT) {
                    LOG_INF("Impact imminent — IIS3DWB capturing burst");
                }

                /* End on swing end or max duration */
                float duration = session_get_duration_s();
                if (evt == SWING_EVENT_END ||
                    duration >= runtime_config.capture_duration_s) {
                    impact_disarm();
                    uint32_t peak = impact_analyze_peak();
                    session_end();
                    current_state = CAPTURE_STATE_TRANSFER;
                    transfer_requested = true;
                    LOG_INF("State: CAPTURING → TRANSFER (%u samples, %.2fs, impact_peak=%u mg, impact_samples=%u)",
                            session_get_sample_count(), (double)duration,
                            peak, impact_get_count());
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

        /* Send impact vibration data if available */
        uint16_t impact_samples = impact_get_count();
        if (impact_has_data() && impact_samples > 0) {
            snprintf(line_buf, sizeof(line_buf),
                     "# impact_section,sensor=IIS3DWB,rate=26700,samples=%u",
                     impact_samples);
            usb_serial_writeln(line_buf);
            usb_serial_writeln("impact_idx,impact_x_mg,impact_y_mg,impact_z_mg");

            for (uint16_t i = 0; i < impact_samples; i++) {
                int16_t ix, iy, iz;
                if (impact_get_sample(i, &ix, &iy, &iz) == 0) {
                    snprintf(line_buf, sizeof(line_buf), "%u,%d,%d,%d",
                             i, ix, iy, iz);
                    usb_serial_writeln(line_buf);
                }
                if ((i % 64) == 0) k_yield();
            }
        }

        /* Send footer */
        len = csv_format_footer(line_buf, sizeof(line_buf),
                                session_get_id(), sent,
                                session_get_duration_s());
        if (len > 0) {
            usb_serial_writeln(line_buf);
        }

        LOG_INF("Transfer complete: %u IMU + %u impact samples via USB",
                sent, impact_samples);
        transfer_requested = false;
    }
}

/* ---------- LED Status (RED=PD8, GREEN=PD2, BLUE=PH1) ---------- */

static const struct device *led_gpiod;
static const struct device *led_gpioh;
static bool leds_ready = false;

static void leds_init(void)
{
    led_gpiod = DEVICE_DT_GET(DT_NODELABEL(gpiod));
    led_gpioh = DEVICE_DT_GET(DT_NODELABEL(gpioh));
    if (device_is_ready(led_gpiod) && device_is_ready(led_gpioh)) {
        gpio_pin_configure(led_gpiod, 8, GPIO_OUTPUT_INACTIVE);  /* RED */
        gpio_pin_configure(led_gpiod, 2, GPIO_OUTPUT_INACTIVE);  /* GREEN */
        gpio_pin_configure(led_gpioh, 1, GPIO_OUTPUT_INACTIVE);  /* BLUE */
        leds_ready = true;
    }
}

static void leds_set(bool red, bool green, bool blue)
{
    if (!leds_ready) return;
    gpio_pin_set(led_gpiod, 8, red ? 1 : 0);
    gpio_pin_set(led_gpiod, 2, green ? 1 : 0);
    gpio_pin_set(led_gpioh, 1, blue ? 1 : 0);
}

static void leds_update_state(enum capture_state state)
{
    switch (state) {
    case CAPTURE_STATE_IDLE:
    case CAPTURE_STATE_ARMED:
        leds_set(false, true, false);   /* GREEN = ready */
        break;
    case CAPTURE_STATE_CAPTURING:
        leds_set(false, false, true);   /* BLUE = capturing */
        break;
    case CAPTURE_STATE_TRANSFER:
        leds_set(false, true, true);    /* CYAN = transferring */
        break;
    case CAPTURE_STATE_STREAMING:
        leds_set(true, false, true);    /* MAGENTA = streaming */
        break;
    case CAPTURE_STATE_SLEEP:
    default:
        leds_set(false, false, false);  /* OFF */
        break;
    }
}

/* ---------- Main ---------- */

int main(void)
{
    LOG_INF("=== Sovereign Sensor v0.3.0 ===");
    LOG_INF("Predictive Impact Arming + Multi-Sensor CSV");

    /* Enable STBC02 power management (CEN=PD12, open-drain HIGH) */
    const struct device *gpiod = DEVICE_DT_GET(DT_NODELABEL(gpiod));
    const struct device *gpioc = DEVICE_DT_GET(DT_NODELABEL(gpioc));
    if (device_is_ready(gpiod) && device_is_ready(gpioc)) {
        /* STBC02_CEN = PD12: open-drain, drive HIGH to enable */
        gpio_pin_configure(gpiod, 12, GPIO_OUTPUT_HIGH | GPIO_OPEN_DRAIN);
        /* ST1PS02 voltage select: D0=PC9, D1=PC10, D2=PC11 -> all HIGH = 3.3V */
        gpio_pin_configure(gpioc, 9, GPIO_OUTPUT_HIGH);
        gpio_pin_configure(gpioc, 10, GPIO_OUTPUT_HIGH);
        gpio_pin_configure(gpioc, 11, GPIO_OUTPUT_HIGH);
        /* ST1PS02_AUX = PD13 HIGH */
        gpio_pin_configure(gpiod, 13, GPIO_OUTPUT_HIGH);
        LOG_INF("Power: STBC02 enabled, ST1PS02 set to 3.3V");
        /* Wait for power to stabilize */
        k_msleep(50);
    }

    /* Initialize LEDs for status feedback */
    leds_init();
    leds_set(true, false, false);  /* RED = initializing */

    /* Initialize subsystems */
    int ret = ring_buffer_init();
    if (ret < 0) {
        LOG_ERR("Ring buffer init failed: %d", ret);
        return ret;
    }

    ret = imu_init();
    if (ret < 0) {
        LOG_ERR("IMU init failed: %d", ret);
    }

    ret = impact_detect_init();
    if (ret < 0) {
        LOG_WRN("Impact sensor not available: %d", ret);
    }

    ret = environment_init();
    if (ret < 0) {
        LOG_WRN("Environment sensors not available: %d", ret);
    }

    ret = usb_serial_init();
    if (ret < 0) {
        LOG_ERR("USB serial init failed: %d", ret);
    }

    ret = ble_service_init();
    if (ret < 0) {
        LOG_ERR("BLE init failed: %d", ret);
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

    leds_set(false, true, false);  /* GREEN = ready */

    /* Main thread: status reporting + LED state updates + BLE notifications */
    while (1) {
        leds_update_state(current_state);

        /* BLE status notifications every 500ms */
        if (ble_is_connected()) {
            ble_notify_status(current_state,
                              usb_serial_is_connected(),
                              session_get_id(),
                              session_get_sample_count(),
                              ring_buffer_count());
        }

        k_msleep(500);

        /* Status log every 10 cycles (5 seconds) */
        static uint8_t log_count = 0;
        if (++log_count >= 10) {
            log_count = 0;
            if (imu_is_ready()) {
                float temp = environment_read_temperature();
                LOG_INF("Status: state=%s ring=%d/%d usb=%s ble=%s temp=%.1fC",
                        capture_state_name(current_state),
                        ring_buffer_count(), RING_BUFFER_SAMPLES,
                        usb_serial_is_connected() ? "yes" : "no",
                        ble_is_connected() ? "yes" : "no",
                        (double)temp);
            }
        }
    }

    return 0;
}
