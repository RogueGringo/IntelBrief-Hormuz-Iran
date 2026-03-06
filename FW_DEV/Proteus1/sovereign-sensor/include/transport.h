#ifndef TRANSPORT_H
#define TRANSPORT_H

#include "sensor_config.h"
#include <stdbool.h>

/* USB Serial */
int usb_serial_init(void);
int usb_serial_write(const char *data, int len);
int usb_serial_writeln(const char *line);
bool usb_serial_is_connected(void);

/* BLE GATT Service */
int ble_service_init(void);
bool ble_is_connected(void);
int ble_notify_status(uint8_t state, bool usb_connected,
                      uint16_t session_id, uint32_t sample_count,
                      int ring_count);
int ble_notify_imu(const struct imu_sample *sample);

#endif /* TRANSPORT_H */
