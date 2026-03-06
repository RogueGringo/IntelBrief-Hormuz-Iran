#ifndef TRANSPORT_H
#define TRANSPORT_H

#include "sensor_config.h"
#include <stdbool.h>

/* USB Serial */
int usb_serial_init(void);
int usb_serial_write(const char *data, int len);
int usb_serial_writeln(const char *line);
bool usb_serial_is_connected(void);

#endif /* TRANSPORT_H */
