/*
 * Session management — tracks capture sessions with IDs.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include "capture.h"
#include "sensor_config.h"

LOG_MODULE_REGISTER(session, LOG_LEVEL_INF);

static uint16_t session_counter = 0;
static uint16_t current_session_id = 0;
static uint32_t current_sample_count = 0;
static int64_t session_start_ms = 0;
static bool session_active = false;

uint16_t session_start(void)
{
    session_counter++;
    current_session_id = session_counter;
    current_sample_count = 0;
    session_start_ms = k_uptime_get();
    session_active = true;
    LOG_INF("Session %04u started", current_session_id);
    return current_session_id;
}

void session_end(void)
{
    if (!session_active) return;
    int64_t duration_ms = k_uptime_get() - session_start_ms;
    LOG_INF("Session %04u ended: %u samples, %lld ms",
            current_session_id, current_sample_count, duration_ms);
    session_active = false;
}

void session_add_sample(void)
{
    current_sample_count++;
}

uint16_t session_get_id(void)
{
    return current_session_id;
}

uint32_t session_get_sample_count(void)
{
    return current_sample_count;
}

float session_get_duration_s(void)
{
    if (!session_active) return 0.0f;
    return (float)(k_uptime_get() - session_start_ms) / 1000.0f;
}

bool session_is_active(void)
{
    return session_active;
}
