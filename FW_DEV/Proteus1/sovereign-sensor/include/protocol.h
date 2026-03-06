#ifndef PROTOCOL_H
#define PROTOCOL_H

#include "sensor_config.h"

/* CSV formatting */
int csv_format_header(char *buf, int buf_size,
                      const char *device_id, uint16_t sample_rate_hz,
                      uint16_t session_id, const char *capture_mode);
int csv_format_sample(char *buf, int buf_size, const struct imu_sample *sample);
int csv_format_footer(char *buf, int buf_size,
                      uint16_t session_id, uint32_t sample_count,
                      float duration_s);

#endif /* PROTOCOL_H */
