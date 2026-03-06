/*
 * Lock-free single-producer single-consumer ring buffer for IMU samples.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <string.h>
#include "capture.h"

LOG_MODULE_REGISTER(ring_buffer, LOG_LEVEL_INF);

static struct imu_sample buffer[RING_BUFFER_SAMPLES];
static volatile uint32_t head = 0;  /* write index */
static volatile uint32_t tail = 0;  /* read index */

int ring_buffer_init(void)
{
    head = 0;
    tail = 0;
    memset(buffer, 0, sizeof(buffer));
    LOG_INF("Ring buffer initialized: %d samples, %d bytes",
            RING_BUFFER_SAMPLES, RING_BUFFER_SIZE);
    return 0;
}

int ring_buffer_push(const struct imu_sample *sample)
{
    uint32_t next_head = (head + 1) % RING_BUFFER_SAMPLES;
    if (next_head == tail) {
        /* Buffer full — overwrite oldest (circular behavior) */
        tail = (tail + 1) % RING_BUFFER_SAMPLES;
    }
    buffer[head] = *sample;
    head = next_head;
    return 0;
}

int ring_buffer_pop(struct imu_sample *sample)
{
    if (head == tail) {
        return -ENODATA;  /* empty */
    }
    *sample = buffer[tail];
    tail = (tail + 1) % RING_BUFFER_SAMPLES;
    return 0;
}

int ring_buffer_peek(struct imu_sample *sample, int offset)
{
    int count = ring_buffer_count();
    if (offset >= count) {
        return -ENODATA;
    }
    uint32_t idx = (tail + offset) % RING_BUFFER_SAMPLES;
    *sample = buffer[idx];
    return 0;
}

int ring_buffer_count(void)
{
    int32_t count = (int32_t)head - (int32_t)tail;
    if (count < 0) count += RING_BUFFER_SAMPLES;
    return count;
}

bool ring_buffer_is_full(void)
{
    return ((head + 1) % RING_BUFFER_SAMPLES) == tail;
}

bool ring_buffer_is_empty(void)
{
    return head == tail;
}

void ring_buffer_clear(void)
{
    tail = head;
}

const char *capture_state_name(enum capture_state state)
{
    switch (state) {
    case CAPTURE_STATE_SLEEP:     return "SLEEP";
    case CAPTURE_STATE_IDLE:      return "IDLE";
    case CAPTURE_STATE_ARMED:     return "ARMED";
    case CAPTURE_STATE_CAPTURING: return "CAPTURE";
    case CAPTURE_STATE_TRANSFER:  return "TRANSFER";
    case CAPTURE_STATE_STREAMING: return "STREAMING";
    default:                      return "UNKNOWN";
    }
}
