/*
 * ISM330DHCX 6-axis IMU driver wrapper for Sovereign Sensor.
 * Reads accelerometer + gyroscope, packs into imu_sample.
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/logging/log.h>
#include "sensor_config.h"

LOG_MODULE_REGISTER(imu, LOG_LEVEL_INF);

static const struct device *imu_dev;
static bool imu_initialized = false;

int imu_init(void)
{
    imu_dev = DEVICE_DT_GET_ONE(st_ism330dhcx);
    if (!device_is_ready(imu_dev)) {
        LOG_ERR("ISM330DHCX not ready");
        return -ENODEV;
    }

    /* Set default ODR */
    struct sensor_value odr = { .val1 = DEFAULT_SAMPLE_RATE_HZ, .val2 = 0 };
    sensor_attr_set(imu_dev, SENSOR_CHAN_ACCEL_XYZ,
                    SENSOR_ATTR_SAMPLING_FREQUENCY, &odr);
    sensor_attr_set(imu_dev, SENSOR_CHAN_GYRO_XYZ,
                    SENSOR_ATTR_SAMPLING_FREQUENCY, &odr);

    imu_initialized = true;
    LOG_INF("ISM330DHCX initialized at %d Hz", DEFAULT_SAMPLE_RATE_HZ);
    return 0;
}

int imu_set_rate(uint16_t rate_hz)
{
    if (!imu_initialized) return -ENODEV;
    struct sensor_value odr = { .val1 = rate_hz, .val2 = 0 };
    sensor_attr_set(imu_dev, SENSOR_CHAN_ACCEL_XYZ,
                    SENSOR_ATTR_SAMPLING_FREQUENCY, &odr);
    sensor_attr_set(imu_dev, SENSOR_CHAN_GYRO_XYZ,
                    SENSOR_ATTR_SAMPLING_FREQUENCY, &odr);
    LOG_INF("ISM330DHCX rate set to %d Hz", rate_hz);
    return 0;
}

int imu_read_sample(struct imu_sample *sample)
{
    if (!imu_initialized) return -ENODEV;

    int ret = sensor_sample_fetch(imu_dev);
    if (ret < 0) {
        LOG_WRN("IMU fetch failed: %d", ret);
        return ret;
    }

    struct sensor_value val[3];

    sensor_channel_get(imu_dev, SENSOR_CHAN_ACCEL_XYZ, val);
    /* sensor_value is in m/s^2, convert to mg */
    sample->accel_x_mg = (int16_t)(sensor_value_to_double(&val[0]) * 1000.0 / 9.80665);
    sample->accel_y_mg = (int16_t)(sensor_value_to_double(&val[1]) * 1000.0 / 9.80665);
    sample->accel_z_mg = (int16_t)(sensor_value_to_double(&val[2]) * 1000.0 / 9.80665);

    sensor_channel_get(imu_dev, SENSOR_CHAN_GYRO_XYZ, val);
    /* sensor_value is in rad/s, convert to mdps */
    sample->gyro_x_mdps = (int16_t)(sensor_value_to_double(&val[0]) * 57295.78);
    sample->gyro_y_mdps = (int16_t)(sensor_value_to_double(&val[1]) * 57295.78);
    sample->gyro_z_mdps = (int16_t)(sensor_value_to_double(&val[2]) * 57295.78);

    sample->timestamp_us = k_cyc_to_us_floor32(k_cycle_get_32());

    return 0;
}

bool imu_is_ready(void)
{
    return imu_initialized;
}
