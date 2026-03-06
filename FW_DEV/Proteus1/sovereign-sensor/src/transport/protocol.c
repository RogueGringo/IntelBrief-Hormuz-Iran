/*
 * CSV protocol formatting for IMU data transfer.
 * Format designed for direct ingestion by sovereign-lib pipeline.
 */

#include <zephyr/kernel.h>
#include <stdio.h>
#include "protocol.h"

int csv_format_header(char *buf, int buf_size,
                      const char *device_id, uint16_t sample_rate_hz,
                      uint16_t session_id, const char *capture_mode)
{
    return snprintf(buf, buf_size,
        "# device=%s,rate=%u,session=%04u,mode=%s\r\n"
        "timestamp_us,accel_x_mg,accel_y_mg,accel_z_mg,"
        "gyro_x_mdps,gyro_y_mdps,gyro_z_mdps",
        device_id, sample_rate_hz, session_id, capture_mode);
}

int csv_format_sample(char *buf, int buf_size, const struct imu_sample *sample)
{
    return snprintf(buf, buf_size,
        "%u,%d,%d,%d,%d,%d,%d",
        sample->timestamp_us,
        sample->accel_x_mg, sample->accel_y_mg, sample->accel_z_mg,
        sample->gyro_x_mdps, sample->gyro_y_mdps, sample->gyro_z_mdps);
}

int csv_format_footer(char *buf, int buf_size,
                      uint16_t session_id, uint32_t sample_count,
                      float duration_s)
{
    return snprintf(buf, buf_size,
        "# end session=%04u,samples=%u,duration=%.2f",
        session_id, sample_count, (double)duration_s);
}
