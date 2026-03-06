# Proteus1 Sovereign Sensor Firmware — Implementation Plan (Phase 1)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build Phase 1 firmware for STEVAL-PROTEUS1: threshold-based swing capture with USB CDC serial CSV output, directly compatible with sovereign-lib's CSV ingest.

**Architecture:** Zephyr RTOS application with 4 threads (sensor, capture, transport, power). ISM330DHCX samples at configurable rate into a ring buffer. IIS2DLPC provides wake-on-motion interrupt. USB CDC outputs CSV. Phase 1 omits BLE (added in Phase 2).

**Tech Stack:** Zephyr RTOS 3.6+, west build system, CMake, arm-none-eabi-gcc (Zephyr SDK), STM32CubeProgrammer for flashing, Python 3.11 for host-side testing.

**Design doc:** `docs/plans/2026-03-05-proteus1-firmware-design.md`

**Programmer:** STLINK-V3MINIE on COM3 (SWD), STM32CubeProgrammer v2.19.0 at `C:\Program Files\STMicroelectronics\STM32Cube\STM32CubeProgrammer\bin\STM32_Programmer_CLI.exe`

**MCU confirmed:** STM32WB5x, Device ID 0x495, 1MB Flash, connected and responding.

---

## Task 1: Install Zephyr SDK and West

**Files:** None (toolchain setup)

**Step 1: Install west and CMake**

```bash
pip install west cmake
```

**Step 2: Verify installation**

```bash
west --version
cmake --version
```

Expected: west 1.x.x, cmake 3.x.x

**Step 3: Initialize Zephyr workspace**

Choose a location outside the project repo for the Zephyr tree (it's ~2GB). We'll reference it via `ZEPHYR_BASE`.

```bash
mkdir -p /c/zephyr-workspace
cd /c/zephyr-workspace
west init
west update
```

This takes 10-20 minutes. It downloads the full Zephyr tree + modules.

**Step 4: Install Zephyr SDK**

Download and install the Zephyr SDK (includes arm-none-eabi-gcc):

```bash
cd /c/zephyr-workspace
west sdk install
```

Or download manually from https://github.com/zephyrproject-rtos/sdk-ng/releases — install to `C:\zephyr-sdk-0.16.8` (or latest).

**Step 5: Install Python requirements**

```bash
pip install -r /c/zephyr-workspace/zephyr/scripts/requirements.txt
```

**Step 6: Set environment**

```bash
export ZEPHYR_BASE=/c/zephyr-workspace/zephyr
export ZEPHYR_SDK_INSTALL_DIR=/c/zephyr-sdk-0.16.8
```

Add these to your shell profile for persistence.

**Step 7: Verify with a test build**

```bash
cd /c/zephyr-workspace
west build -b nucleo_wb55rg zephyr/samples/hello_world
```

Expected: Build succeeds. (nucleo_wb55rg is the closest supported board to STEVAL-PROTEUS1 — same STM32WB5x family.)

**Step 8: Commit a breadcrumb**

No code to commit yet, but create the directory structure:

```bash
cd "C:/Claude/New folder/IntelAction_PanelZ"
mkdir -p FW_DEV/Proteus1/sovereign-sensor
git add FW_DEV/
git commit --allow-empty -m "chore: initialize FW_DEV/Proteus1/sovereign-sensor directory"
```

---

## Task 2: Zephyr Project Scaffold

**Files:**
- Create: `FW_DEV/Proteus1/sovereign-sensor/CMakeLists.txt`
- Create: `FW_DEV/Proteus1/sovereign-sensor/prj.conf`
- Create: `FW_DEV/Proteus1/sovereign-sensor/src/main.c`

**Step 1: Create CMakeLists.txt**

```cmake
# SPDX-License-Identifier: Apache-2.0

cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(sovereign_sensor)

target_sources(app PRIVATE
    src/main.c
)
```

**Step 2: Create prj.conf**

```
# Sovereign Sensor — Phase 1 Kconfig
# USB CDC for CSV output
CONFIG_USB_DEVICE_STACK=y
CONFIG_USB_CDC_ACM=y
CONFIG_SERIAL=y
CONFIG_CONSOLE=y
CONFIG_UART_CONSOLE=n
CONFIG_USB_DEVICE_PRODUCT="Sovereign Sensor"
CONFIG_USB_DEVICE_MANUFACTURER="Sovereign Motion"
CONFIG_USB_DEVICE_VID=0x0483
CONFIG_USB_DEVICE_PID=0x5740

# Logging
CONFIG_LOG=y
CONFIG_LOG_DEFAULT_LEVEL=3

# GPIO (for sensor interrupts)
CONFIG_GPIO=y

# I2C (sensor bus)
CONFIG_I2C=y

# Sensor subsystem
CONFIG_SENSOR=y

# ISM330DHCX
CONFIG_ISM330DHCX=y
CONFIG_ISM330DHCX_TRIGGER_GLOBAL_THREAD=y

# IIS2DLPC
CONFIG_IIS2DLPC=y
CONFIG_IIS2DLPC_TRIGGER_GLOBAL_THREAD=y

# LPS22HH
CONFIG_LPS22HH=y

# STTS751
CONFIG_STTS751=y

# IIS2MDC (magnetometer)
CONFIG_IIS2MDC=y

# Threading
CONFIG_MAIN_STACK_SIZE=4096
CONFIG_SYSTEM_WORKQUEUE_STACK_SIZE=2048

# Timing
CONFIG_COUNTER=y
CONFIG_SYS_CLOCK_TICKS_PER_SEC=1000
```

**Step 3: Create src/main.c (minimal boot test)**

```c
/*
 * Sovereign Sensor — Phase 1 Main
 * STEVAL-PROTEUS1 (STM32WB5x)
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(sovereign_sensor, LOG_LEVEL_INF);

int main(void)
{
    LOG_INF("Sovereign Sensor v1.0 — Phase 1");
    LOG_INF("Board: %s", CONFIG_BOARD);

    while (1) {
        k_sleep(K_SECONDS(1));
    }

    return 0;
}
```

**Step 4: Build**

```bash
cd "C:/Claude/New folder/IntelAction_PanelZ"
west build -b nucleo_wb55rg FW_DEV/Proteus1/sovereign-sensor -- -DBOARD_ROOT="C:/Claude/New folder/IntelAction_PanelZ/FW_DEV/Proteus1/sovereign-sensor"
```

Note: We use `nucleo_wb55rg` initially. Task 3 creates a custom board overlay for Proteus1.

Expected: Build succeeds.

**Step 5: Flash and verify**

```bash
west flash
```

Or manually:

```bash
"/c/Program Files/STMicroelectronics/STM32Cube/STM32CubeProgrammer/bin/STM32_Programmer_CLI.exe" -c port=SWD -w build/zephyr/zephyr.bin 0x08000000 -v -rst
```

Expected: Board boots, LED blinks or serial output visible.

**Step 6: Commit**

```bash
git add FW_DEV/Proteus1/sovereign-sensor/
git commit -m "feat: scaffold Zephyr project for sovereign-sensor"
```

---

## Task 3: Board Overlay for STEVAL-PROTEUS1

**Files:**
- Create: `FW_DEV/Proteus1/sovereign-sensor/boards/nucleo_wb55rg.overlay`

The STEVAL-PROTEUS1 uses the same STM32WB5x as the Nucleo-WB55RG. The overlay maps the Proteus1's specific sensor I2C bus and interrupt pins.

**Step 1: Create device tree overlay**

The STEVAL-PROTEUS1 sensor connections (from ST documentation):
- I2C1 for sensors (SCL=PB6, SDA=PB7 — same as Nucleo-WB55RG default)
- ISM330DHCX INT1 on a GPIO pin (check board schematic — typically PA0 or PC5)
- IIS2DLPC INT1 on a GPIO pin (wake-on-motion)

```dts
/* boards/nucleo_wb55rg.overlay
 * Device tree overlay for STEVAL-PROTEUS1 sensors on Nucleo-WB55RG pinout.
 * Adjust GPIO pins per actual Proteus1 schematic.
 */

&i2c1 {
    status = "okay";
    clock-frequency = <I2C_BITRATE_FAST>;  /* 400kHz */

    ism330dhcx@6a {
        compatible = "st,ism330dhcx";
        reg = <0x6a>;
        irq-gpios = <&gpioa 0 GPIO_ACTIVE_HIGH>;  /* INT1 — verify pin */
        accel-odr = <3>;   /* 104 Hz default, reconfigured at runtime */
        gyro-odr = <3>;
    };

    iis2dlpc@19 {
        compatible = "st,iis2dlpc";
        reg = <0x19>;
        irq-gpios = <&gpioc 5 GPIO_ACTIVE_HIGH>;  /* INT1 — verify pin */
    };

    iis2mdc@1e {
        compatible = "st,iis2mdc";
        reg = <0x1e>;
    };

    lps22hh@5c {
        compatible = "st,lps22hh";
        reg = <0x5c>;
    };

    stts751@48 {
        compatible = "st,stts751";
        reg = <0x48>;
    };
};
```

**Step 2: Rebuild with overlay**

```bash
west build -b nucleo_wb55rg FW_DEV/Proteus1/sovereign-sensor -p
```

The `-p` flag does a pristine rebuild. The overlay is auto-detected from `boards/nucleo_wb55rg.overlay`.

Expected: Build succeeds with sensor nodes in device tree.

**Step 3: Flash and verify sensors initialize**

```bash
west flash
```

Monitor serial output. If sensors are wired correctly, Zephyr logs will show sensor driver initialization. If a sensor fails (wrong address or pin), the log will show the error — adjust the overlay.

**Step 4: Commit**

```bash
git add FW_DEV/Proteus1/sovereign-sensor/boards/
git commit -m "feat: add device tree overlay for STEVAL-PROTEUS1 sensors"
```

---

## Task 4: Sensor Config and ISM330DHCX Reader

**Files:**
- Create: `FW_DEV/Proteus1/sovereign-sensor/include/sensor_config.h`
- Create: `FW_DEV/Proteus1/sovereign-sensor/src/sensors/ism330dhcx.c`
- Modify: `FW_DEV/Proteus1/sovereign-sensor/CMakeLists.txt`
- Modify: `FW_DEV/Proteus1/sovereign-sensor/src/main.c`

**Step 1: Create include/sensor_config.h**

```c
#ifndef SENSOR_CONFIG_H
#define SENSOR_CONFIG_H

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
} __packed;

/* Runtime configuration */
struct sensor_runtime_config {
    uint16_t sample_rate_hz;
    uint16_t wake_threshold_mg;
    uint8_t capture_mode;       /* 0=manual, 1=threshold, 2=preroll, 3=ml_core */
    uint8_t capture_duration_s;
    uint8_t preroll_s;
};

#endif /* SENSOR_CONFIG_H */
```

**Step 2: Create src/sensors/ism330dhcx.c**

```c
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
```

**Step 3: Update CMakeLists.txt**

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(sovereign_sensor)

target_include_directories(app PRIVATE include)

target_sources(app PRIVATE
    src/main.c
    src/sensors/ism330dhcx.c
)
```

**Step 4: Update main.c to test IMU reading**

```c
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include "sensor_config.h"

LOG_MODULE_REGISTER(sovereign_sensor, LOG_LEVEL_INF);

/* From sensors/ism330dhcx.c */
int imu_init(void);
int imu_read_sample(struct imu_sample *sample);

int main(void)
{
    LOG_INF("Sovereign Sensor v1.0 — Phase 1");

    int ret = imu_init();
    if (ret < 0) {
        LOG_ERR("IMU init failed: %d", ret);
    }

    struct imu_sample sample;
    while (1) {
        if (imu_read_sample(&sample) == 0) {
            LOG_INF("IMU: ax=%d ay=%d az=%d gx=%d gy=%d gz=%d",
                    sample.accel_x_mg, sample.accel_y_mg, sample.accel_z_mg,
                    sample.gyro_x_mdps, sample.gyro_y_mdps, sample.gyro_z_mdps);
        }
        k_sleep(K_MSEC(100));  /* 10 Hz for testing */
    }

    return 0;
}
```

**Step 5: Build, flash, verify IMU readings on serial**

```bash
west build -b nucleo_wb55rg FW_DEV/Proteus1/sovereign-sensor -p
west flash
```

Open COM3 at 115200 baud. Expected: IMU readings printing at 10Hz.

**Step 6: Commit**

```bash
git add FW_DEV/Proteus1/sovereign-sensor/
git commit -m "feat: add ISM330DHCX IMU reader with sample data structure"
```

---

## Task 5: Ring Buffer

**Files:**
- Create: `FW_DEV/Proteus1/sovereign-sensor/include/capture.h`
- Create: `FW_DEV/Proteus1/sovereign-sensor/src/capture/ring_buffer.c`
- Modify: `FW_DEV/Proteus1/sovereign-sensor/CMakeLists.txt`

**Step 1: Create include/capture.h**

```c
#ifndef CAPTURE_H
#define CAPTURE_H

#include "sensor_config.h"
#include <stdbool.h>

/* Ring buffer for IMU samples */
int ring_buffer_init(void);
int ring_buffer_push(const struct imu_sample *sample);
int ring_buffer_pop(struct imu_sample *sample);
int ring_buffer_peek(struct imu_sample *sample, int offset);
int ring_buffer_count(void);
bool ring_buffer_is_full(void);
bool ring_buffer_is_empty(void);
void ring_buffer_clear(void);

/* Swing detection states */
enum capture_state {
    CAPTURE_STATE_SLEEP = 0,
    CAPTURE_STATE_IDLE,
    CAPTURE_STATE_ARMED,
    CAPTURE_STATE_CAPTURING,
    CAPTURE_STATE_TRANSFER,
    CAPTURE_STATE_STREAMING,
};

const char *capture_state_name(enum capture_state state);

#endif /* CAPTURE_H */
```

**Step 2: Create src/capture/ring_buffer.c**

```c
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
```

**Step 3: Update CMakeLists.txt**

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(sovereign_sensor)

target_include_directories(app PRIVATE include)

target_sources(app PRIVATE
    src/main.c
    src/sensors/ism330dhcx.c
    src/capture/ring_buffer.c
)
```

**Step 4: Build to verify compilation**

```bash
west build -b nucleo_wb55rg FW_DEV/Proteus1/sovereign-sensor -p
```

Expected: Build succeeds.

**Step 5: Commit**

```bash
git add FW_DEV/Proteus1/sovereign-sensor/
git commit -m "feat: add ring buffer for IMU sample capture"
```

---

## Task 6: USB CDC Serial CSV Output

**Files:**
- Create: `FW_DEV/Proteus1/sovereign-sensor/include/transport.h`
- Create: `FW_DEV/Proteus1/sovereign-sensor/include/protocol.h`
- Create: `FW_DEV/Proteus1/sovereign-sensor/src/transport/usb_serial.c`
- Create: `FW_DEV/Proteus1/sovereign-sensor/src/transport/protocol.c`
- Modify: `FW_DEV/Proteus1/sovereign-sensor/CMakeLists.txt`

**Step 1: Create include/transport.h**

```c
#ifndef TRANSPORT_H
#define TRANSPORT_H

#include "sensor_config.h"

/* USB Serial */
int usb_serial_init(void);
int usb_serial_write(const char *data, int len);
int usb_serial_writeln(const char *line);
bool usb_serial_is_connected(void);

#endif /* TRANSPORT_H */
```

**Step 2: Create include/protocol.h**

```c
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
```

**Step 3: Create src/transport/usb_serial.c**

```c
/*
 * USB CDC ACM serial output for CSV debug/development.
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

int usb_serial_init(void)
{
    int ret = usb_enable(NULL);
    if (ret < 0 && ret != -EALREADY) {
        LOG_ERR("USB enable failed: %d", ret);
        return ret;
    }

    cdc_dev = DEVICE_DT_GET_ONE(zephyr_cdc_acm_uart);
    if (!device_is_ready(cdc_dev)) {
        LOG_ERR("CDC ACM device not ready");
        return -ENODEV;
    }

    /* Wait briefly for USB enumeration */
    k_sleep(K_MSEC(1000));

    usb_initialized = true;
    LOG_INF("USB CDC serial initialized");
    return 0;
}

int usb_serial_write(const char *data, int len)
{
    if (!usb_initialized || !cdc_dev) return -ENODEV;

    for (int i = 0; i < len; i++) {
        uart_poll_out(cdc_dev, data[i]);
    }
    return len;
}

int usb_serial_writeln(const char *line)
{
    int len = strlen(line);
    int ret = usb_serial_write(line, len);
    if (ret > 0) {
        usb_serial_write("\r\n", 2);
    }
    return ret;
}

bool usb_serial_is_connected(void)
{
    if (!usb_initialized || !cdc_dev) return false;
    uint32_t dtr = 0;
    uart_line_ctrl_get(cdc_dev, UART_LINE_CTRL_DTR, &dtr);
    return dtr != 0;
}
```

**Step 4: Create src/transport/protocol.c**

```c
/*
 * CSV protocol formatting for sovereign-lib compatibility.
 */

#include <zephyr/kernel.h>
#include <stdio.h>
#include "protocol.h"

int csv_format_header(char *buf, int buf_size,
                      const char *device_id, uint16_t sample_rate_hz,
                      uint16_t session_id, const char *capture_mode)
{
    return snprintf(buf, buf_size,
        "# SOVEREIGN-SENSOR v1.0\r\n"
        "# device_id: %s\r\n"
        "# sample_rate_hz: %u\r\n"
        "# session_id: %04u\r\n"
        "# capture_mode: %s\r\n"
        "timestamp_s,accel_x_g,accel_y_g,accel_z_g,gyro_x_dps,gyro_y_dps,gyro_z_dps",
        device_id, sample_rate_hz, session_id, capture_mode);
}

int csv_format_sample(char *buf, int buf_size, const struct imu_sample *sample)
{
    /* Convert from mg to g, from mdps to dps */
    return snprintf(buf, buf_size,
        "%.4f,%.3f,%.3f,%.3f,%.1f,%.1f,%.1f",
        sample->timestamp_us / 1000000.0,
        sample->accel_x_mg / 1000.0,
        sample->accel_y_mg / 1000.0,
        sample->accel_z_mg / 1000.0,
        sample->gyro_x_mdps / 1000.0,
        sample->gyro_y_mdps / 1000.0,
        sample->gyro_z_mdps / 1000.0);
}

int csv_format_footer(char *buf, int buf_size,
                      uint16_t session_id, uint32_t sample_count,
                      float duration_s)
{
    return snprintf(buf, buf_size,
        "# END session_id: %04u, samples: %u, duration_s: %.3f",
        session_id, sample_count, (double)duration_s);
}
```

**Step 5: Update CMakeLists.txt**

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(sovereign_sensor)

target_include_directories(app PRIVATE include)

target_sources(app PRIVATE
    src/main.c
    src/sensors/ism330dhcx.c
    src/capture/ring_buffer.c
    src/transport/usb_serial.c
    src/transport/protocol.c
)
```

**Step 6: Build and verify**

```bash
west build -b nucleo_wb55rg FW_DEV/Proteus1/sovereign-sensor -p
```

Expected: Build succeeds.

**Step 7: Commit**

```bash
git add FW_DEV/Proteus1/sovereign-sensor/
git commit -m "feat: add USB CDC serial output with CSV protocol formatting"
```

---

## Task 7: Swing Detection (Threshold — Phase 1)

**Files:**
- Create: `FW_DEV/Proteus1/sovereign-sensor/src/capture/swing_detect.c`
- Create: `FW_DEV/Proteus1/sovereign-sensor/src/capture/session.c`
- Modify: `FW_DEV/Proteus1/sovereign-sensor/CMakeLists.txt`

**Step 1: Create src/capture/swing_detect.c**

```c
/*
 * Swing detection — Phase 1: simple threshold.
 * Triggers capture when acceleration magnitude exceeds threshold.
 * Ends capture when magnitude drops below threshold for cooldown period.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <math.h>
#include "capture.h"
#include "sensor_config.h"

LOG_MODULE_REGISTER(swing_detect, LOG_LEVEL_INF);

static uint16_t threshold_mg = DEFAULT_WAKE_THRESHOLD_MG;
static uint32_t cooldown_ms = DEFAULT_COOLDOWN_S * 1000;
static int64_t last_above_threshold_ms = 0;

void swing_detect_set_threshold(uint16_t mg)
{
    threshold_mg = mg;
    LOG_INF("Swing threshold set to %u mg", mg);
}

void swing_detect_set_cooldown(uint32_t ms)
{
    cooldown_ms = ms;
}

static uint32_t accel_magnitude(const struct imu_sample *sample)
{
    /* Compute magnitude in mg: sqrt(ax^2 + ay^2 + az^2) */
    int32_t ax = sample->accel_x_mg;
    int32_t ay = sample->accel_y_mg;
    int32_t az = sample->accel_z_mg;
    /* Subtract gravity (1000 mg on z in static) for dynamic acceleration */
    uint32_t sum = (uint32_t)(ax * ax + ay * ay + (az - 1000) * (az - 1000));
    /* Integer sqrt approximation */
    uint32_t root = 0;
    uint32_t bit = 1u << 30;
    while (bit > sum) bit >>= 2;
    while (bit != 0) {
        if (sum >= root + bit) {
            sum -= root + bit;
            root = (root >> 1) + bit;
        } else {
            root >>= 1;
        }
        bit >>= 2;
    }
    return root;
}

enum swing_event {
    SWING_EVENT_NONE = 0,
    SWING_EVENT_START,
    SWING_EVENT_END,
};

enum swing_event swing_detect_check(const struct imu_sample *sample)
{
    uint32_t mag = accel_magnitude(sample);
    int64_t now_ms = k_uptime_get();

    if (mag > threshold_mg) {
        if (last_above_threshold_ms == 0) {
            /* First time above threshold — swing start */
            last_above_threshold_ms = now_ms;
            LOG_INF("Swing start detected (mag=%u mg)", mag);
            return SWING_EVENT_START;
        }
        last_above_threshold_ms = now_ms;
        return SWING_EVENT_NONE;
    }

    /* Below threshold */
    if (last_above_threshold_ms > 0) {
        if ((now_ms - last_above_threshold_ms) > cooldown_ms) {
            /* Cooldown elapsed — swing end */
            last_above_threshold_ms = 0;
            LOG_INF("Swing end detected (cooldown elapsed)");
            return SWING_EVENT_END;
        }
    }

    return SWING_EVENT_NONE;
}

void swing_detect_reset(void)
{
    last_above_threshold_ms = 0;
}
```

**Step 2: Create src/capture/session.c**

```c
/*
 * Session management — tracks capture sessions with IDs.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include "capture.h"
#include "sensor_config.h"

LOG_MODULE_REGISTER(session, LOG_LEVEL_INF);

static uint16_t session_counter = 0;
static uint16_t current_session_id = 0;
static uint32_t current_sample_count = 0;
static int64_t session_start_ms = 0;
static bool session_active = false;

uint16_t session_start(void)
{
    session_counter++;
    current_session_id = session_counter;
    current_sample_count = 0;
    session_start_ms = k_uptime_get();
    session_active = true;
    LOG_INF("Session %04u started", current_session_id);
    return current_session_id;
}

void session_end(void)
{
    if (!session_active) return;
    int64_t duration_ms = k_uptime_get() - session_start_ms;
    LOG_INF("Session %04u ended: %u samples, %lld ms",
            current_session_id, current_sample_count, duration_ms);
    session_active = false;
}

void session_add_sample(void)
{
    current_sample_count++;
}

uint16_t session_get_id(void)
{
    return current_session_id;
}

uint32_t session_get_sample_count(void)
{
    return current_sample_count;
}

float session_get_duration_s(void)
{
    if (!session_active) return 0.0f;
    return (float)(k_uptime_get() - session_start_ms) / 1000.0f;
}

bool session_is_active(void)
{
    return session_active;
}
```

**Step 3: Update CMakeLists.txt**

```cmake
cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})
project(sovereign_sensor)

target_include_directories(app PRIVATE include)

target_sources(app PRIVATE
    src/main.c
    src/sensors/ism330dhcx.c
    src/capture/ring_buffer.c
    src/capture/swing_detect.c
    src/capture/session.c
    src/transport/usb_serial.c
    src/transport/protocol.c
)
```

**Step 4: Build**

```bash
west build -b nucleo_wb55rg FW_DEV/Proteus1/sovereign-sensor -p
```

**Step 5: Commit**

```bash
git add FW_DEV/Proteus1/sovereign-sensor/
git commit -m "feat: add threshold swing detection and session management"
```

---

## Task 8: Main Application — Wire It All Together

**Files:**
- Modify: `FW_DEV/Proteus1/sovereign-sensor/src/main.c` (full rewrite)

**Step 1: Rewrite main.c with the full Phase 1 application**

```c
/*
 * Sovereign Sensor — Phase 1 Main Application
 *
 * Threads:
 *   Sensor:   Reads ISM330DHCX at configured rate -> ring buffer
 *   Capture:  Monitors acceleration for swing detection -> session mgmt
 *   Transport: Drains ring buffer -> USB CDC CSV output
 *   (Power thread deferred to Phase 2)
 *
 * State machine: IDLE -> ARMED -> CAPTURE -> TRANSFER -> IDLE
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include "sensor_config.h"
#include "capture.h"
#include "transport.h"
#include "protocol.h"

LOG_MODULE_REGISTER(sovereign_sensor, LOG_LEVEL_INF);

/* External function declarations */
int imu_init(void);
int imu_read_sample(struct imu_sample *sample);
int imu_set_rate(uint16_t rate_hz);
bool imu_is_ready(void);

enum swing_event { SWING_EVENT_NONE = 0, SWING_EVENT_START, SWING_EVENT_END };
enum swing_event swing_detect_check(const struct imu_sample *sample);
void swing_detect_reset(void);
void swing_detect_set_threshold(uint16_t mg);

uint16_t session_start(void);
void session_end(void);
void session_add_sample(void);
uint16_t session_get_id(void);
uint32_t session_get_sample_count(void);
float session_get_duration_s(void);
bool session_is_active(void);

/* Global state */
static volatile enum capture_state g_state = CAPTURE_STATE_IDLE;
static struct sensor_runtime_config g_config = {
    .sample_rate_hz = DEFAULT_SAMPLE_RATE_HZ,
    .wake_threshold_mg = DEFAULT_WAKE_THRESHOLD_MG,
    .capture_mode = 1,  /* threshold */
    .capture_duration_s = DEFAULT_CAPTURE_DURATION_S,
    .preroll_s = DEFAULT_PREROLL_S,
};

/* Thread stacks */
#define SENSOR_STACK_SIZE    2048
#define CAPTURE_STACK_SIZE   2048
#define TRANSPORT_STACK_SIZE 4096

K_THREAD_STACK_DEFINE(sensor_stack, SENSOR_STACK_SIZE);
K_THREAD_STACK_DEFINE(capture_stack, CAPTURE_STACK_SIZE);
K_THREAD_STACK_DEFINE(transport_stack, TRANSPORT_STACK_SIZE);

static struct k_thread sensor_thread_data;
static struct k_thread capture_thread_data;
static struct k_thread transport_thread_data;

/* Semaphore to signal transport thread */
K_SEM_DEFINE(transfer_sem, 0, 1);

/* ─── SENSOR THREAD ─────────────────────────────────── */
static void sensor_thread(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1); ARG_UNUSED(p2); ARG_UNUSED(p3);

    struct imu_sample sample;
    uint32_t period_us = 1000000 / g_config.sample_rate_hz;

    LOG_INF("Sensor thread started (%d Hz, %d us period)",
            g_config.sample_rate_hz, period_us);

    while (1) {
        if (g_state == CAPTURE_STATE_ARMED ||
            g_state == CAPTURE_STATE_CAPTURING ||
            g_state == CAPTURE_STATE_STREAMING) {

            if (imu_read_sample(&sample) == 0) {
                ring_buffer_push(&sample);
            }
        }

        k_usleep(period_us);
    }
}

/* ─── CAPTURE THREAD ────────────────────────────────── */
static void capture_thread(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1); ARG_UNUSED(p2); ARG_UNUSED(p3);

    LOG_INF("Capture thread started");

    /* Start in ARMED state — ready to detect swings */
    g_state = CAPTURE_STATE_ARMED;
    LOG_INF("State: %s", capture_state_name(g_state));

    while (1) {
        if (g_state == CAPTURE_STATE_ARMED ||
            g_state == CAPTURE_STATE_CAPTURING) {

            /* Peek at latest sample without consuming it */
            struct imu_sample sample;
            int count = ring_buffer_count();
            if (count > 0 && ring_buffer_peek(&sample, count - 1) == 0) {
                enum swing_event evt = swing_detect_check(&sample);

                if (evt == SWING_EVENT_START && g_state == CAPTURE_STATE_ARMED) {
                    g_state = CAPTURE_STATE_CAPTURING;
                    session_start();
                    LOG_INF("State: %s (session %04u)",
                            capture_state_name(g_state), session_get_id());
                }

                if (g_state == CAPTURE_STATE_CAPTURING) {
                    session_add_sample();

                    /* Check duration limit */
                    if (session_get_duration_s() > g_config.capture_duration_s) {
                        evt = SWING_EVENT_END;
                    }
                }

                if (evt == SWING_EVENT_END && g_state == CAPTURE_STATE_CAPTURING) {
                    session_end();
                    g_state = CAPTURE_STATE_TRANSFER;
                    LOG_INF("State: %s", capture_state_name(g_state));
                    k_sem_give(&transfer_sem);
                }
            }
        }

        k_sleep(K_MSEC(2));  /* Check at 500 Hz */
    }
}

/* ─── TRANSPORT THREAD ──────────────────────────────── */
static void transport_thread(void *p1, void *p2, void *p3)
{
    ARG_UNUSED(p1); ARG_UNUSED(p2); ARG_UNUSED(p3);

    char line_buf[256];

    LOG_INF("Transport thread started");

    while (1) {
        /* Wait for transfer signal */
        k_sem_take(&transfer_sem, K_FOREVER);

        if (g_state != CAPTURE_STATE_TRANSFER) continue;

        LOG_INF("Transferring session %04u (%d samples in buffer)",
                session_get_id(), ring_buffer_count());

        /* CSV header */
        csv_format_header(line_buf, sizeof(line_buf),
                         "PROTEUS1-003C0035",
                         g_config.sample_rate_hz,
                         session_get_id(),
                         "threshold");
        usb_serial_writeln(line_buf);

        /* CSV data rows */
        struct imu_sample sample;
        uint32_t count = 0;
        while (ring_buffer_pop(&sample) == 0) {
            csv_format_sample(line_buf, sizeof(line_buf), &sample);
            usb_serial_writeln(line_buf);
            count++;
        }

        /* CSV footer */
        float duration = (count > 0) ?
            (float)count / g_config.sample_rate_hz : 0.0f;
        csv_format_footer(line_buf, sizeof(line_buf),
                         session_get_id(), count, duration);
        usb_serial_writeln(line_buf);

        LOG_INF("Transfer complete: %u samples, %.3f s", count, (double)duration);

        /* Return to ARMED */
        swing_detect_reset();
        g_state = CAPTURE_STATE_ARMED;
        LOG_INF("State: %s", capture_state_name(g_state));
    }
}

/* ─── MAIN ──────────────────────────────────────────── */
int main(void)
{
    LOG_INF("╔══════════════════════════════════════╗");
    LOG_INF("║  Sovereign Sensor v1.0 — Phase 1    ║");
    LOG_INF("║  Board: %s                    ║", CONFIG_BOARD);
    LOG_INF("╚══════════════════════════════════════╝");

    /* Initialize subsystems */
    ring_buffer_init();

    int ret = usb_serial_init();
    if (ret < 0) {
        LOG_WRN("USB serial init failed: %d (continuing without USB)", ret);
    }

    ret = imu_init();
    if (ret < 0) {
        LOG_ERR("IMU init failed: %d — halting", ret);
        return ret;
    }

    swing_detect_set_threshold(g_config.wake_threshold_mg);

    /* Spawn threads */
    k_thread_create(&sensor_thread_data, sensor_stack,
                    K_THREAD_STACK_SIZEOF(sensor_stack),
                    sensor_thread, NULL, NULL, NULL,
                    5, 0, K_NO_WAIT);  /* Priority 5 */
    k_thread_name_set(&sensor_thread_data, "sensor");

    k_thread_create(&capture_thread_data, capture_stack,
                    K_THREAD_STACK_SIZEOF(capture_stack),
                    capture_thread, NULL, NULL, NULL,
                    3, 0, K_NO_WAIT);  /* Priority 3 (highest) */
    k_thread_name_set(&capture_thread_data, "capture");

    k_thread_create(&transport_thread_data, transport_stack,
                    K_THREAD_STACK_SIZEOF(transport_stack),
                    transport_thread, NULL, NULL, NULL,
                    7, 0, K_NO_WAIT);  /* Priority 7 */
    k_thread_name_set(&transport_thread_data, "transport");

    LOG_INF("All threads spawned — entering main idle loop");

    /* Main thread becomes idle watchdog */
    while (1) {
        LOG_DBG("State: %s, Buffer: %d/%d",
                capture_state_name(g_state),
                ring_buffer_count(), RING_BUFFER_SAMPLES);
        k_sleep(K_SECONDS(5));
    }

    return 0;
}
```

**Step 2: Build**

```bash
west build -b nucleo_wb55rg FW_DEV/Proteus1/sovereign-sensor -p
```

**Step 3: Flash and test end-to-end**

```bash
west flash
```

1. Open a terminal on COM3 (the USB CDC port from the Proteus1, NOT the STLINK VCP)
2. Shake/swing the board — should see CSV output on the terminal
3. The CSV should match sovereign-lib's expected format
4. Copy the CSV and test with: `curl -X POST http://localhost:7860/api/ingest -F "file=@swing.csv"`

**Step 4: Commit**

```bash
git add FW_DEV/Proteus1/sovereign-sensor/src/main.c
git commit -m "feat: wire Phase 1 application — threshold capture + USB CSV output"
```

---

## Task 9: Host-Side Serial Reader (Python)

**Files:**
- Create: `FW_DEV/Proteus1/sovereign-sensor/tools/serial_reader.py`
- Create: `FW_DEV/Proteus1/sovereign-sensor/tools/requirements.txt`

**Step 1: Create tools/requirements.txt**

```
pyserial>=3.5
requests>=2.31
```

**Step 2: Create tools/serial_reader.py**

```python
"""
Host-side serial reader for Sovereign Sensor.
Reads CSV sessions from USB serial and optionally auto-ingests
into the Sovereign Motion Dashboard via /api/ingest.
"""
import argparse
import io
import sys
import time

import serial
import requests


def read_session(port: str, baud: int = 115200) -> str | None:
    """Read one complete CSV session from serial port."""
    ser = serial.Serial(port, baud, timeout=1)
    print(f"Listening on {port} at {baud} baud...")

    lines: list[str] = []
    in_session = False

    try:
        while True:
            raw = ser.readline()
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace").strip()

            if line.startswith("# SOVEREIGN-SENSOR"):
                in_session = True
                lines = [line]
                print(f"Session started: {line}")
                continue

            if in_session:
                lines.append(line)
                if line.startswith("# END"):
                    print(f"Session complete: {line}")
                    return "\n".join(lines)

    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        ser.close()

    return None


def save_csv(csv_data: str, output_dir: str = ".") -> str:
    """Save CSV session to a file."""
    import os
    import re

    match = re.search(r"session_id:\s*(\d+)", csv_data)
    session_id = match.group(1) if match else "0000"
    filename = f"swing_{session_id}.csv"
    path = os.path.join(output_dir, filename)

    with open(path, "w") as f:
        f.write(csv_data)

    print(f"Saved: {path}")
    return path


def auto_ingest(csv_data: str, api_url: str = "http://localhost:7860") -> dict:
    """Upload CSV session to Sovereign Motion Dashboard."""
    files = {"file": ("swing.csv", io.BytesIO(csv_data.encode()), "text/csv")}
    resp = requests.post(f"{api_url}/api/ingest", files=files)
    result = resp.json()
    print(f"Ingested: {result}")

    # Trigger full analysis pipeline
    swing_id = result.get("id")
    if swing_id:
        resp = requests.post(f"{api_url}/api/analyze/{swing_id}")
        analysis = resp.json()
        print(f"Analyzed: {analysis.get('status', 'unknown')}")
        return analysis

    return result


def main():
    parser = argparse.ArgumentParser(description="Sovereign Sensor Serial Reader")
    parser.add_argument("--port", default="COM3", help="Serial port (default: COM3)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate")
    parser.add_argument("--output", default=".", help="Output directory for CSV files")
    parser.add_argument("--auto-ingest", action="store_true",
                        help="Auto-upload to dashboard API")
    parser.add_argument("--api-url", default="http://localhost:7860",
                        help="Dashboard API URL")
    parser.add_argument("--loop", action="store_true",
                        help="Continuously listen for sessions")
    args = parser.parse_args()

    while True:
        csv_data = read_session(args.port, args.baud)
        if csv_data:
            save_csv(csv_data, args.output)
            if args.auto_ingest:
                try:
                    auto_ingest(csv_data, args.api_url)
                except Exception as e:
                    print(f"Auto-ingest failed: {e}")

        if not args.loop:
            break

        print("Waiting for next session...")


if __name__ == "__main__":
    main()
```

**Step 3: Test (once firmware is flashed and board is connected)**

```bash
cd "C:/Claude/New folder/IntelAction_PanelZ/FW_DEV/Proteus1/sovereign-sensor/tools"
pip install -r requirements.txt
python serial_reader.py --port COM3 --auto-ingest --loop
```

Expected: Captures swing CSV from board, auto-uploads to dashboard, triggers analysis pipeline.

**Step 4: Commit**

```bash
git add FW_DEV/Proteus1/sovereign-sensor/tools/
git commit -m "feat: add host-side serial reader with auto-ingest to dashboard"
```

---

## Task 10: Documentation and Integration Test

**Files:**
- Create: `FW_DEV/Proteus1/sovereign-sensor/README.md`
- Modify: `CLAUDE.md` (add firmware section)

**Step 1: Create firmware README**

```markdown
# Sovereign Sensor — Proteus1 Firmware

Zephyr RTOS firmware for STEVAL-PROTEUS1 (STM32WB5x). Captures golf swing
IMU data and outputs CSV compatible with sovereign-lib.

## Phase 1 (Current)
- ISM330DHCX 6-axis IMU sampling at configurable rate
- Threshold-based swing detection
- USB CDC serial CSV output
- Host-side serial reader with auto-ingest

## Hardware
- STEVAL-PROTEUS1 (STM32WB5MMG)
- STLINK-V3MINIE programmer
- Sensors: ISM330DHCX, IIS2DLPC, IIS2MDC, LPS22HH, STTS751

## Build & Flash
```bash
# Set Zephyr environment
export ZEPHYR_BASE=/c/zephyr-workspace/zephyr

# Build
west build -b nucleo_wb55rg .

# Flash
west flash
```

## Host Tools
```bash
cd tools
pip install -r requirements.txt
python serial_reader.py --port COM3 --auto-ingest --loop
```

## CSV Format
Output is directly compatible with sovereign-lib CSV ingest:
```
timestamp_s,accel_x_g,accel_y_g,accel_z_g,gyro_x_dps,gyro_y_dps,gyro_z_dps
```
```

**Step 2: Update CLAUDE.md with firmware section**

Add to the end of CLAUDE.md:

```markdown
## Firmware (FW_DEV/Proteus1/sovereign-sensor/)
- **Board:** STEVAL-PROTEUS1 (STM32WB5x)
- **RTOS:** Zephyr
- **Phase 1:** Threshold capture + USB CSV
- **Programmer:** STLINK-V3MINIE on COM3
- **Build:** `west build -b nucleo_wb55rg FW_DEV/Proteus1/sovereign-sensor`
- **Host tool:** `tools/serial_reader.py --port COM3 --auto-ingest --loop`
```

**Step 3: End-to-end integration test**

1. Flash firmware to Proteus1
2. Start dashboard backend: `cd hf-proxy && python app.py`
3. Start frontend: `npm run dev`
4. Start serial reader: `python tools/serial_reader.py --port COM3 --auto-ingest --loop`
5. Swing the board
6. Verify: Session Feed tab shows new swing with CSV data
7. Verify: Signal Monitor shows updated data inventory signals

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Phase 1 sovereign-sensor firmware with host tools and docs"
```

---

## Dependency Graph

```
Task 1 (Zephyr SDK install) ──→ Task 2 (scaffold) ──→ Task 3 (board overlay)
                                                              │
Task 4 (IMU reader) ←─────────────────────────────────────────┘
     │
Task 5 (ring buffer) ←────────────────────────────────────────┘
     │
Task 6 (USB CDC + CSV protocol) ←─────────────────────────────┘
     │
Task 7 (swing detection + session) ←──────────────────────────┘
     │
Task 8 (main app — wire all threads) ←────────────────────────┘
     │
Task 9 (host-side serial reader) ←────────────────────────────┘
     │
Task 10 (docs + integration test) ←───────────────────────────┘
```

All tasks are sequential — each builds on the previous. No parallel opportunities in firmware (hardware-coupled, must verify each layer before stacking the next).
