#ifndef CAPTURE_H
#define CAPTURE_H

#include "sensor_config.h"
#include <stdbool.h>

/* Ring buffer for IMU samples */
int ring_buffer_init(void);
int ring_buffer_push(const struct imu_sample *sample);
int ring_buffer_pop(struct imu_sample *sample);
int ring_buffer_peek(struct imu_sample *sample, int offset);
int ring_buffer_count(void);
bool ring_buffer_is_full(void);
bool ring_buffer_is_empty(void);
void ring_buffer_clear(void);

/* Swing detection states */
enum capture_state {
    CAPTURE_STATE_SLEEP = 0,
    CAPTURE_STATE_IDLE,
    CAPTURE_STATE_ARMED,
    CAPTURE_STATE_CAPTURING,
    CAPTURE_STATE_TRANSFER,
    CAPTURE_STATE_STREAMING,
};

const char *capture_state_name(enum capture_state state);

/* Swing detection events */
enum swing_event {
    SWING_EVENT_NONE = 0,
    SWING_EVENT_START,
    SWING_EVENT_END,
};

/* Swing detection */
void swing_detect_set_threshold(uint16_t mg);
void swing_detect_set_cooldown(uint32_t ms);
enum swing_event swing_detect_check(const struct imu_sample *sample);
void swing_detect_reset(void);

/* Session management */
uint16_t session_start(void);
void session_end(void);
void session_add_sample(void);
uint16_t session_get_id(void);
uint32_t session_get_sample_count(void);
float session_get_duration_s(void);
bool session_is_active(void);

#endif /* CAPTURE_H */
