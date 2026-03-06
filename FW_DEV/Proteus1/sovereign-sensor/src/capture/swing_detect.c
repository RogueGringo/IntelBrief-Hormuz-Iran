/*
 * Swing detection — Phase 1: simple threshold.
 * Triggers capture when acceleration magnitude exceeds threshold.
 * Ends capture when magnitude drops below threshold for cooldown period.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include "capture.h"
#include "sensor_config.h"

LOG_MODULE_REGISTER(swing_detect, LOG_LEVEL_INF);

static uint16_t threshold_mg = DEFAULT_WAKE_THRESHOLD_MG;
static uint32_t cooldown_ms = DEFAULT_COOLDOWN_S * 1000;
static int64_t last_above_threshold_ms = 0;

void swing_detect_set_threshold(uint16_t mg)
{
    threshold_mg = mg;
    LOG_INF("Swing threshold set to %u mg", mg);
}

void swing_detect_set_cooldown(uint32_t ms)
{
    cooldown_ms = ms;
}

static uint32_t accel_magnitude_dynamic(const struct imu_sample *sample)
{
    /* Compute dynamic acceleration magnitude in mg (subtract gravity) */
    int32_t ax = sample->accel_x_mg;
    int32_t ay = sample->accel_y_mg;
    int32_t az = sample->accel_z_mg - 1000;  /* subtract 1g on z-axis */
    uint32_t sum_sq = (uint32_t)(ax * ax + ay * ay + az * az);
    /* Integer square root */
    uint32_t root = 0;
    uint32_t bit = 1u << 30;
    while (bit > sum_sq) bit >>= 2;
    while (bit != 0) {
        if (sum_sq >= root + bit) {
            sum_sq -= root + bit;
            root = (root >> 1) + bit;
        } else {
            root >>= 1;
        }
        bit >>= 2;
    }
    return root;
}

enum swing_event swing_detect_check(const struct imu_sample *sample)
{
    uint32_t mag = accel_magnitude_dynamic(sample);
    int64_t now_ms = k_uptime_get();

    if (mag > threshold_mg) {
        if (last_above_threshold_ms == 0) {
            /* First time above threshold — swing start */
            last_above_threshold_ms = now_ms;
            LOG_INF("Swing start detected (mag=%u mg)", mag);
            return SWING_EVENT_START;
        }
        last_above_threshold_ms = now_ms;
        return SWING_EVENT_NONE;
    }

    /* Below threshold */
    if (last_above_threshold_ms > 0) {
        if ((now_ms - last_above_threshold_ms) > (int64_t)cooldown_ms) {
            /* Cooldown elapsed — swing end */
            last_above_threshold_ms = 0;
            LOG_INF("Swing end detected (cooldown elapsed)");
            return SWING_EVENT_END;
        }
    }

    return SWING_EVENT_NONE;
}

void swing_detect_reset(void)
{
    last_above_threshold_ms = 0;
}
