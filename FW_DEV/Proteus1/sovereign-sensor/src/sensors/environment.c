/*
 * Environment sensing — STTS22H temperature + IIS2DLPC wake-on-motion.
 *
 * STTS22H: Temperature for sensor drift compensation.
 * IIS2DLPC: Ultra-low-power accelerometer for wake-on-motion detection.
 *           Can wake the system from deep sleep when the golf bag moves.
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/sensor.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(environment, LOG_LEVEL_INF);

static const struct device *stts22h_dev;
static const struct device *iis2dlpc_dev;
static bool temp_ready = false;
static bool wake_ready = false;
static float last_temp_c = 25.0f;

int environment_init(void)
{
    int ret = 0;

    stts22h_dev = DEVICE_DT_GET_OR_NULL(DT_NODELABEL(stts22h));
    if (stts22h_dev && device_is_ready(stts22h_dev)) {
        temp_ready = true;
        LOG_INF("STTS22H temperature sensor ready");
    } else {
        LOG_WRN("STTS22H not available");
        ret = -ENODEV;
    }

    iis2dlpc_dev = DEVICE_DT_GET_OR_NULL(DT_NODELABEL(iis2dlpc));
    if (iis2dlpc_dev && device_is_ready(iis2dlpc_dev)) {
        wake_ready = true;
        LOG_INF("IIS2DLPC wake-on-motion sensor ready");
    } else {
        LOG_WRN("IIS2DLPC not available");
    }

    return ret;
}

float environment_read_temperature(void)
{
    if (!temp_ready) return last_temp_c;

    if (sensor_sample_fetch(stts22h_dev) == 0) {
        struct sensor_value val;
        if (sensor_channel_get(stts22h_dev, SENSOR_CHAN_AMBIENT_TEMP, &val) == 0) {
            last_temp_c = (float)val.val1 + (float)val.val2 / 1000000.0f;
        }
    }
    return last_temp_c;
}

bool environment_temp_ready(void)
{
    return temp_ready;
}

bool environment_wake_ready(void)
{
    return wake_ready;
}

/* Read IIS2DLPC acceleration for motion detection */
int environment_read_wake_accel(int16_t *x_mg, int16_t *y_mg, int16_t *z_mg)
{
    if (!wake_ready) return -ENODEV;

    if (sensor_sample_fetch(iis2dlpc_dev) < 0) return -EIO;

    struct sensor_value ax, ay, az;
    sensor_channel_get(iis2dlpc_dev, SENSOR_CHAN_ACCEL_X, &ax);
    sensor_channel_get(iis2dlpc_dev, SENSOR_CHAN_ACCEL_Y, &ay);
    sensor_channel_get(iis2dlpc_dev, SENSOR_CHAN_ACCEL_Z, &az);

    *x_mg = (int16_t)(ax.val1 * 1000 + ax.val2 / 1000);
    *y_mg = (int16_t)(ay.val1 * 1000 + ay.val2 / 1000);
    *z_mg = (int16_t)(az.val1 * 1000 + az.val2 / 1000);

    return 0;
}
