/*
 * USB CDC ACM serial transport for Sovereign Sensor.
 * Sends CSV data to host over USB serial.
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/usb/usb_device.h>
#include <zephyr/logging/log.h>
#include <string.h>
#include "transport.h"

LOG_MODULE_REGISTER(usb_serial, LOG_LEVEL_INF);

static const struct device *cdc_dev;
static bool usb_initialized = false;
static volatile bool dtr_set = false;

static void cdc_acm_irq_handler(const struct device *dev, void *user_data)
{
    ARG_UNUSED(user_data);

    while (uart_irq_update(dev) && uart_irq_is_pending(dev)) {
        if (uart_irq_rx_ready(dev)) {
            uint8_t buf[64];
            int len = uart_fifo_read(dev, buf, sizeof(buf));
            /* Discard incoming data for now (Phase 1) */
            ARG_UNUSED(len);
        }
    }
}

int usb_serial_init(void)
{
    int ret;

    cdc_dev = DEVICE_DT_GET_ONE(zephyr_cdc_acm_uart);
    if (!device_is_ready(cdc_dev)) {
        LOG_ERR("CDC ACM device not ready");
        return -ENODEV;
    }

    ret = usb_enable(NULL);
    if (ret != 0 && ret != -EALREADY) {
        LOG_ERR("USB enable failed: %d", ret);
        return ret;
    }

    /* Set up IRQ handler for RX */
    uart_irq_callback_set(cdc_dev, cdc_acm_irq_handler);
    uart_irq_rx_enable(cdc_dev);

    usb_initialized = true;
    LOG_INF("USB CDC ACM initialized");
    return 0;
}

int usb_serial_write(const char *data, int len)
{
    if (!usb_initialized || !dtr_set) return -ENODEV;

    int sent = 0;
    while (sent < len) {
        int n = uart_fifo_fill(cdc_dev, (const uint8_t *)data + sent, len - sent);
        if (n < 0) return n;
        sent += n;
        if (sent < len) {
            k_usleep(100);
        }
    }
    return sent;
}

int usb_serial_writeln(const char *line)
{
    int ret = usb_serial_write(line, strlen(line));
    if (ret < 0) return ret;
    return usb_serial_write("\r\n", 2);
}

bool usb_serial_is_connected(void)
{
    if (!usb_initialized) return false;

    uint32_t dtr_val = 0;
    uart_line_ctrl_get(cdc_dev, UART_LINE_CTRL_DTR, &dtr_val);
    dtr_set = (dtr_val != 0);
    return dtr_set;
}
