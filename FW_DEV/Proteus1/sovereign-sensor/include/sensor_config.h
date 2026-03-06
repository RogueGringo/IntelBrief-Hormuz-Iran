#ifndef SENSOR_CONFIG_H
#define SENSOR_CONFIG_H

#include <stdint.h>

/* Default sample rate (Hz). Configurable at runtime. */
#define DEFAULT_SAMPLE_RATE_HZ      500

/* Maximum sample rate the ISM330DHCX supports */
#define MAX_SAMPLE_RATE_HZ          6660

/* Swing capture defaults */
#define DEFAULT_WAKE_THRESHOLD_MG   1500
#define DEFAULT_CAPTURE_DURATION_S  5
#define DEFAULT_PREROLL_S           1
#define DEFAULT_COOLDOWN_S          1

/* Ring buffer: enough for MAX_SAMPLE_RATE * CAPTURE_DURATION */
/* 14 bytes per sample (4 timestamp + 6*int16_t) */
#define SAMPLE_SIZE_BYTES           14
#define RING_BUFFER_SAMPLES         4096  /* ~8s at 500Hz, ~2.5s at 1.66kHz */
#define RING_BUFFER_SIZE            (RING_BUFFER_SAMPLES * SAMPLE_SIZE_BYTES)

/* IMU sample data structure */
struct imu_sample {
    uint32_t timestamp_us;
    int16_t accel_x_mg;
    int16_t accel_y_mg;
    int16_t accel_z_mg;
    int16_t gyro_x_mdps;
    int16_t gyro_y_mdps;
    int16_t gyro_z_mdps;
} __attribute__((packed));

/* Runtime configuration */
struct sensor_runtime_config {
    uint16_t sample_rate_hz;
    uint16_t wake_threshold_mg;
    uint8_t capture_mode;       /* 0=manual, 1=threshold, 2=preroll, 3=ml_core */
    uint8_t capture_duration_s;
    uint8_t preroll_s;
};

#endif /* SENSOR_CONFIG_H */
