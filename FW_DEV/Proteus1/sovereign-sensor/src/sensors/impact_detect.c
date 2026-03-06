/*
 * Impact detection using IIS3DWB wide-bandwidth vibration sensor via raw SPI.
 *
 * No Zephyr driver exists for IIS3DWB, so we use raw SPI on SPI1 with CS=PA15.
 * The IIS3DWB operates at 26.7kHz — capturing the microsecond signature
 * of club-ball impact or any high-frequency vibration.
 *
 * Register map reference: IIS3DWB datasheet (DocID029637 Rev 7)
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/spi.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/logging/log.h>
#include "sensor_config.h"

LOG_MODULE_REGISTER(impact, LOG_LEVEL_INF);

/* IIS3DWB registers */
#define IIS3DWB_WHO_AM_I     0x0F
#define IIS3DWB_WHO_AM_I_VAL 0x7B
#define IIS3DWB_CTRL1_XL     0x10
#define IIS3DWB_CTRL6_C      0x15
#define IIS3DWB_STATUS_REG   0x1E
#define IIS3DWB_OUT_X_L      0x28

#define IMPACT_BUFFER_SAMPLES 2700  /* ~100ms at 26.7kHz */

struct impact_sample {
    int16_t accel_x_mg;
    int16_t accel_y_mg;
    int16_t accel_z_mg;
};

static const struct device *spi_dev;
static struct spi_config spi_cfg;
static bool impact_sensor_ready = false;
static struct impact_sample impact_buffer[IMPACT_BUFFER_SAMPLES];
static volatile uint16_t impact_count = 0;
static volatile bool impact_armed = false;
static volatile bool impact_captured = false;

static int iis3dwb_read_reg(uint8_t reg, uint8_t *val, uint8_t len)
{
    uint8_t tx_buf[1] = { reg | 0x80 };  /* Read bit */
    uint8_t rx_buf[7];  /* max 1 + 6 */
    struct spi_buf tx = { .buf = tx_buf, .len = 1 };
    struct spi_buf_set tx_set = { .buffers = &tx, .count = 1 };
    struct spi_buf rx = { .buf = rx_buf, .len = 1 + len };
    struct spi_buf_set rx_set = { .buffers = &rx, .count = 1 };

    int ret = spi_transceive(spi_dev, &spi_cfg, &tx_set, &rx_set);
    if (ret < 0) return ret;
    memcpy(val, &rx_buf[1], len);
    return 0;
}

static int iis3dwb_write_reg(uint8_t reg, uint8_t val)
{
    uint8_t tx_buf[2] = { reg & 0x7F, val };  /* Write bit clear */
    struct spi_buf tx = { .buf = tx_buf, .len = 2 };
    struct spi_buf_set tx_set = { .buffers = &tx, .count = 1 };

    return spi_write(spi_dev, &spi_cfg, &tx_set);
}

int impact_detect_init(void)
{
    spi_dev = DEVICE_DT_GET(DT_NODELABEL(spi1));
    if (!device_is_ready(spi_dev)) {
        LOG_WRN("SPI1 not ready for IIS3DWB");
        return -ENODEV;
    }

    /* IIS3DWB uses CS index 1 (PA15) on SPI1 */
    const struct device *gpioa = DEVICE_DT_GET(DT_NODELABEL(gpioa));
    spi_cfg.frequency = 10000000;
    spi_cfg.operation = SPI_WORD_SET(8) | SPI_OP_MODE_MASTER |
                        SPI_MODE_CPOL | SPI_MODE_CPHA | SPI_TRANSFER_MSB;
    spi_cfg.cs.gpio.port = gpioa;
    spi_cfg.cs.gpio.pin = 15;
    spi_cfg.cs.gpio.dt_flags = GPIO_ACTIVE_LOW;
    spi_cfg.cs.delay = 0;

    /* Check WHO_AM_I */
    uint8_t who = 0;
    int ret = iis3dwb_read_reg(IIS3DWB_WHO_AM_I, &who, 1);
    if (ret < 0 || who != IIS3DWB_WHO_AM_I_VAL) {
        LOG_WRN("IIS3DWB not found (WHO_AM_I=0x%02x, expected 0x%02x)", who, IIS3DWB_WHO_AM_I_VAL);
        return -ENODEV;
    }

    /* Configure: 26.7kHz, +/-16g */
    /* CTRL1_XL: ODR=26.7kHz (1010b), FS=+/-16g (11b), LPF2_XL_EN=0 */
    iis3dwb_write_reg(IIS3DWB_CTRL1_XL, 0xAC);

    impact_sensor_ready = true;
    LOG_INF("IIS3DWB impact sensor initialized (WHO=0x%02x, 26.7kHz, +/-16g)", who);
    return 0;
}

bool impact_is_ready(void)
{
    return impact_sensor_ready;
}

void impact_arm(void)
{
    if (!impact_sensor_ready) return;
    impact_count = 0;
    impact_captured = false;
    impact_armed = true;
}

void impact_disarm(void)
{
    impact_armed = false;
}

int impact_capture_sample(void)
{
    if (!impact_armed || impact_captured || !impact_sensor_ready) return -ENODEV;
    if (impact_count >= IMPACT_BUFFER_SAMPLES) {
        impact_captured = true;
        impact_armed = false;
        LOG_INF("Impact buffer full: %u samples", impact_count);
        return 1;
    }

    /* Read 6 bytes: XL, XH, YL, YH, ZL, ZH */
    uint8_t data[6];
    int ret = iis3dwb_read_reg(IIS3DWB_OUT_X_L, data, 6);
    if (ret < 0) return ret;

    /* Convert to mg (at +/-16g: 0.488 mg/LSB) */
    int16_t raw_x = (int16_t)(data[0] | (data[1] << 8));
    int16_t raw_y = (int16_t)(data[2] | (data[3] << 8));
    int16_t raw_z = (int16_t)(data[4] | (data[5] << 8));

    /* Scale: raw * 0.488 ≈ raw / 2 for quick approximation */
    impact_buffer[impact_count].accel_x_mg = raw_x / 2;
    impact_buffer[impact_count].accel_y_mg = raw_y / 2;
    impact_buffer[impact_count].accel_z_mg = raw_z / 2;
    impact_count++;

    return 0;
}

bool impact_has_data(void)
{
    return impact_captured;
}

uint16_t impact_get_count(void)
{
    return impact_count;
}

int impact_get_sample(uint16_t index, int16_t *x, int16_t *y, int16_t *z)
{
    if (!impact_captured || index >= impact_count) return -EINVAL;
    *x = impact_buffer[index].accel_x_mg;
    *y = impact_buffer[index].accel_y_mg;
    *z = impact_buffer[index].accel_z_mg;
    return 0;
}

uint32_t impact_analyze_peak(void)
{
    if (!impact_captured || impact_count == 0) return 0;

    uint32_t max_mag = 0;
    for (uint16_t i = 0; i < impact_count; i++) {
        int32_t ax = impact_buffer[i].accel_x_mg;
        int32_t ay = impact_buffer[i].accel_y_mg;
        int32_t az = impact_buffer[i].accel_z_mg;
        uint32_t mag = (uint32_t)(ax * ax + ay * ay + az * az);
        if (mag > max_mag) max_mag = mag;
    }

    /* Integer sqrt */
    uint32_t root = 0, bit = 1u << 30;
    while (bit > max_mag) bit >>= 2;
    while (bit != 0) {
        if (max_mag >= root + bit) {
            max_mag -= root + bit;
            root = (root >> 1) + bit;
        } else {
            root >>= 1;
        }
        bit >>= 2;
    }
    return root;
}
