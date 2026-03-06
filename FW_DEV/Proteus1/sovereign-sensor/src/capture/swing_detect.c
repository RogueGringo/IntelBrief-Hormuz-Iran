/*
 * Swing detection with predictive impact arming.
 *
 * Two-stage detection:
 *   Stage 1 (accel threshold): Triggers capture start when dynamic
 *     acceleration exceeds threshold — same as Phase 1.
 *   Stage 2 (gyro downswing): During capture, monitors gyroscope angular
 *     velocity to detect downswing onset. When gyro rate exceeds threshold
 *     AND is accelerating, signals SWING_EVENT_DOWNSWING so the capture
 *     thread can arm the IIS3DWB burst capture precisely ~100ms before impact.
 *
 * This means the 26.7kHz vibration sensor only captures the impact window,
 * not the entire swing — saving power and buffer space.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include "capture.h"
#include "sensor_config.h"

LOG_MODULE_REGISTER(swing_detect, LOG_LEVEL_INF);

/* Accel threshold detection */
static uint16_t threshold_mg = DEFAULT_WAKE_THRESHOLD_MG;
static uint32_t cooldown_ms = DEFAULT_COOLDOWN_S * 1000;
static int64_t last_above_threshold_ms = 0;

/* Gyro downswing detection */
#define GYRO_DOWNSWING_THRESHOLD_MDPS  50000   /* 50 deg/s — downswing onset */
#define GYRO_IMPACT_PREDICT_MDPS      150000   /* 150 deg/s — impact imminent */
#define GYRO_HISTORY_SIZE             8        /* ~16ms window at 500Hz */

static uint32_t gyro_history[GYRO_HISTORY_SIZE];
static uint8_t gyro_hist_idx = 0;
static bool gyro_hist_full = false;
static bool downswing_detected = false;
static bool impact_predicted = false;

void swing_detect_set_threshold(uint16_t mg)
{
    threshold_mg = mg;
    LOG_INF("Swing threshold set to %u mg", mg);
}

void swing_detect_set_cooldown(uint32_t ms)
{
    cooldown_ms = ms;
}

static uint32_t isqrt32(uint32_t val)
{
    uint32_t root = 0;
    uint32_t bit = 1u << 30;
    while (bit > val) bit >>= 2;
    while (bit != 0) {
        if (val >= root + bit) {
            val -= root + bit;
            root = (root >> 1) + bit;
        } else {
            root >>= 1;
        }
        bit >>= 2;
    }
    return root;
}

static uint32_t accel_magnitude_dynamic(const struct imu_sample *sample)
{
    int32_t ax = sample->accel_x_mg;
    int32_t ay = sample->accel_y_mg;
    int32_t az = sample->accel_z_mg - 1000;  /* subtract 1g on z-axis */
    uint32_t sum_sq = (uint32_t)(ax * ax + ay * ay + az * az);
    return isqrt32(sum_sq);
}

static uint32_t gyro_magnitude(const struct imu_sample *sample)
{
    int32_t gx = sample->gyro_x_mdps;
    int32_t gy = sample->gyro_y_mdps;
    int32_t gz = sample->gyro_z_mdps;
    uint32_t sum_sq = (uint32_t)(gx * gx + gy * gy + gz * gz);
    return isqrt32(sum_sq);
}

static void gyro_history_push(uint32_t mag)
{
    gyro_history[gyro_hist_idx] = mag;
    gyro_hist_idx = (gyro_hist_idx + 1) % GYRO_HISTORY_SIZE;
    if (gyro_hist_idx == 0) gyro_hist_full = true;
}

/* Check if gyro rate is increasing (positive slope over window) */
static bool gyro_is_accelerating(void)
{
    if (!gyro_hist_full) return false;

    /* Compare average of first half vs second half of history */
    uint32_t first_half = 0, second_half = 0;
    uint8_t start = gyro_hist_idx;  /* oldest sample */

    for (uint8_t i = 0; i < GYRO_HISTORY_SIZE / 2; i++) {
        first_half += gyro_history[(start + i) % GYRO_HISTORY_SIZE];
    }
    for (uint8_t i = GYRO_HISTORY_SIZE / 2; i < GYRO_HISTORY_SIZE; i++) {
        second_half += gyro_history[(start + i) % GYRO_HISTORY_SIZE];
    }

    /* Second half must be significantly larger (>25% increase) */
    return second_half > first_half + (first_half / 4);
}

enum swing_event swing_detect_check(const struct imu_sample *sample)
{
    uint32_t accel_mag = accel_magnitude_dynamic(sample);
    uint32_t gyro_mag = gyro_magnitude(sample);
    int64_t now_ms = k_uptime_get();

    /* Always track gyro history during active capture */
    gyro_history_push(gyro_mag);

    /* Stage 1: Accel threshold — swing start/end */
    if (accel_mag > threshold_mg) {
        if (last_above_threshold_ms == 0) {
            last_above_threshold_ms = now_ms;
            downswing_detected = false;
            impact_predicted = false;
            LOG_INF("Swing start (accel=%u mg, gyro=%u mdps)", accel_mag, gyro_mag);
            return SWING_EVENT_START;
        }
        last_above_threshold_ms = now_ms;
    } else if (last_above_threshold_ms > 0) {
        if ((now_ms - last_above_threshold_ms) > (int64_t)cooldown_ms) {
            last_above_threshold_ms = 0;
            downswing_detected = false;
            impact_predicted = false;
            LOG_INF("Swing end (cooldown elapsed)");
            return SWING_EVENT_END;
        }
    }

    /* Stage 2: Gyro downswing prediction — only during active capture */
    if (last_above_threshold_ms > 0) {
        if (!impact_predicted &&
            gyro_mag > GYRO_IMPACT_PREDICT_MDPS &&
            gyro_is_accelerating()) {
            /* High angular velocity AND accelerating = impact in ~50-100ms */
            impact_predicted = true;
            LOG_INF("Impact predicted! (gyro=%u mdps, accel=%u mg)", gyro_mag, accel_mag);
            return SWING_EVENT_IMPACT_PREDICT;
        }

        if (!downswing_detected &&
            gyro_mag > GYRO_DOWNSWING_THRESHOLD_MDPS &&
            gyro_is_accelerating()) {
            /* Downswing onset — arm vibration sensor */
            downswing_detected = true;
            LOG_INF("Downswing detected (gyro=%u mdps)", gyro_mag);
            return SWING_EVENT_DOWNSWING;
        }
    }

    return SWING_EVENT_NONE;
}

void swing_detect_reset(void)
{
    last_above_threshold_ms = 0;
    downswing_detected = false;
    impact_predicted = false;
    gyro_hist_idx = 0;
    gyro_hist_full = false;
}
