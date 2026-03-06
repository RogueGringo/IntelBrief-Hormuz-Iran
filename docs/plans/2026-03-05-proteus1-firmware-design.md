# Proteus1 Sovereign Sensor Firmware Design

**Date:** 2026-03-05
**Status:** Approved
**Toolchain:** Zephyr RTOS + west + CMake + arm-none-eabi-gcc
**Board:** STEVAL-PROTEUS1 (STM32WB5x, Cortex-M4 + M0+)

## Context

Build firmware for the STEVAL-PROTEUS1 sensor node to capture golf swing IMU data and feed it into the Sovereign Motion Dashboard / sovereign-lib topology pipeline. The Proteus1 becomes the physical sensor front-end that completes the Sense -> Encode -> Remember chain.

### Hardware

- **MCU:** STM32WB5x — 1MB Flash, 256KB SRAM, Cortex-M4 (app) + Cortex-M0+ (BLE)
- **IMU:** ISM330DHCX — 6-axis (accel + gyro), up to 6.66kHz, built-in ML core
- **Wake sensor:** IIS2DLPC — low-power 3-axis accelerometer, interrupt-driven
- **Magnetometer:** IIS2MDC — 3-axis
- **Pressure:** LPS22HH — barometric pressure / altitude
- **Temperature:** STTS751
- **Programmer:** STLINK-V3MINIE (SWD + VCP on COM3)
- **Tools installed:** STM32CubeProgrammer v2.19.0

### Progressive Feature Build

1. **Phase 1:** Simple threshold capture + USB CSV output + manual upload
2. **Phase 2:** Pre-roll buffer + BLE GATT service + auto-ingest via FastAPI
3. **Phase 3:** ISM330DHCX ML core smart detection + real-time streaming

## Project Structure

```
FW_DEV/
  Proteus1/
    sovereign-sensor/
      CMakeLists.txt
      prj.conf
      boards/
        steval_proteus1.overlay
      src/
        main.c
        sensors/
          ism330dhcx.c
          iis2dlpc.c
          iis2mdc.c
          lps22hh.c
          stts751.c
        capture/
          swing_detect.c
          ring_buffer.c
          session.c
        transport/
          ble_gatt.c
          usb_serial.c
          protocol.c
        power/
          power.c
      include/
        sensor_config.h
        capture.h
        transport.h
        protocol.h
      tests/
```

## Thread Architecture

| Thread | Priority | Rate | Purpose |
|---|---|---|---|
| Sensor | 5 (high) | Timer-driven at configured rate | Read sensors, push to ring buffer |
| Capture | 3 (highest) | Event-driven (wake interrupt + buffer threshold) | Swing detection, session management |
| Transport | 7 (medium) | Event-driven (buffer ready + BLE notify interval) | Drain ring buffer to BLE/USB |
| Power | 10 (low) | 1 Hz | Inactivity timeout, state transitions |
| BLE Command | Callback (ISR context) | On write | Handle config/command characteristics |

### Data Flow

```
IIS2DLPC wake interrupt
    -> Capture thread starts ISM330DHCX at full rate
    -> Sensor thread samples ISM330DHCX -> ring buffer (pre-roll preserved)
    -> Capture thread monitors motion -> detects swing end
    -> Capture thread marks session complete -> signals Transport
    -> Transport drains buffer -> BLE notify (binary) + USB serial (CSV)
    -> Power thread sees inactivity -> returns to low-power
```

### Ring Buffer Sizing

- 500 Hz, 14 bytes/sample: 5 seconds = 35 KB
- 1.66 kHz: 5 seconds = 116 KB
- 256 KB SRAM supports dual buffers (capture + transmit)

## Firmware State Machine

```
BOOT -> SLEEP -> IDLE -> ARMED -> CAPTURE -> TRANSFER -> IDLE
                   ^                                      |
                   |              (inactivity 60s)        |
                   +--------------------------------------+

IDLE -> STREAMING (via START_STREAM command) -> IDLE (via STOP_STREAM)
```

| State | ISM330DHCX | IIS2DLPC | BLE | USB | Power |
|---|---|---|---|---|---|
| BOOT | Initializing | Initializing | Advertising | Enumerating | Full |
| SLEEP | Off | 52Hz (interrupt) | Advertising (slow) | Suspended | ~10uA |
| IDLE | Off | 52Hz (interrupt) | Connected/Advertising | Ready | ~50uA |
| ARMED | Full rate, pre-roll | Active | Connected | CSV echo | Full |
| CAPTURE | Full rate, recording | Active | Connected | CSV echo | Full |
| TRANSFER | Off | Active | Notify drain | CSV dump | Full |
| STREAMING | Full rate, passthrough | Off | Notify stream | CSV stream | Full |

### Progressive Swing Detection

- **Phase 1 (threshold):** Accel magnitude > wake_threshold_mg -> CAPTURE. Below threshold for cooldown_s -> TRANSFER.
- **Phase 2 (pre-roll):** ARMED fills circular buffer at full rate. Wake event preserves last preroll_s seconds. Same end detection.
- **Phase 3 (ML core):** ISM330DHCX decision tree classifies motion. Only "swing_start" triggers CAPTURE.

## BLE GATT Service

### Sovereign Motion Service (custom 128-bit UUID)

**Sensor Data Characteristic (Notify)**
```
uint32_t  timestamp_us     (4 bytes)
int16_t   accel_x_mg       (2 bytes)
int16_t   accel_y_mg       (2 bytes)
int16_t   accel_z_mg       (2 bytes)
int16_t   gyro_x_mdps      (2 bytes)
int16_t   gyro_y_mdps      (2 bytes)
int16_t   gyro_z_mdps      (2 bytes)
```
16 bytes/sample, batched to MTU (244 bytes = 15 samples/packet)

**Config Characteristic (Read/Write)**
```
uint16_t  sample_rate_hz    (500-6660)
uint16_t  wake_threshold_mg (default 1500)
uint8_t   capture_mode      (0=manual, 1=threshold, 2=preroll, 3=ml_core)
uint8_t   capture_duration_s (default 5)
uint8_t   preroll_s          (default 1)
```

**Status Characteristic (Read/Notify)**
```
uint8_t   state             (SLEEP/IDLE/ARMED/CAPTURE/STREAMING)
uint8_t   battery_pct
uint16_t  swings_stored
uint16_t  buffer_usage_pct
int8_t    temperature_c
uint16_t  pressure_hpa
uint8_t   sensor_health     (bitfield: b0=IMU, b1=mag, b2=press, b3=temp, b4=lp_accel)
```

**Command Characteristic (Write)**
```
0x01 = START_CAPTURE
0x02 = STOP_CAPTURE
0x03 = START_STREAM
0x04 = STOP_STREAM
0x05 = TRANSFER_STORED
0x06 = CLEAR_STORAGE
0x07 = RESET
0x08 = ENTER_SLEEP
```

### BLE Throughput

- 500 Hz: ~33 packets/s, ~8 KB/s (standard BLE 5.x)
- 1.66 kHz: ~110 packets/s, ~27 KB/s (requires 2M PHY)

## USB Serial CSV Format

```
# SOVEREIGN-SENSOR v1.0
# device_id: PROTEUS1-003C0035
# sample_rate_hz: 500
# session_id: 0042
# capture_mode: threshold
# start_timestamp: 2026-03-05T17:30:42Z
timestamp_s,accel_x_g,accel_y_g,accel_z_g,gyro_x_dps,gyro_y_dps,gyro_z_dps
0.0000,0.015,-0.012,0.998,2.3,-1.1,0.5
0.0020,0.016,-0.011,0.999,2.4,-1.0,0.6
...
# END session_id: 0042, samples: 2500, duration_s: 5.000
```

Directly compatible with sovereign-lib CSV ingest and dashboard /api/ingest endpoint.

## FastAPI Integration (new endpoints)

### Serial Bridge
```
POST /api/serial/connect     - Open COM port
POST /api/serial/disconnect   - Close COM port
GET  /api/serial/status       - Port state, last activity
```

### BLE Bridge
```
POST /api/ble/scan           - Scan for Sovereign Sensor devices
POST /api/ble/connect        - Connect by address
POST /api/ble/disconnect     - Disconnect
GET  /api/ble/status         - Connection state, RSSI, device info
POST /api/ble/command        - Send command to device
```

### Auto-Ingest Flow

1. Dashboard connects to sensor via serial or BLE
2. Firmware sends CSV header -> FastAPI creates SwingRecord
3. Firmware streams samples -> FastAPI buffers
4. Firmware sends END marker -> FastAPI triggers /api/analyze/{id}
5. Dashboard auto-updates Session Feed

## Sample Rate Configuration

Default 500 Hz (matches sovereign-lib canonical rate). Configurable up to 6.66 kHz via BLE Config characteristic or dashboard UI. ISM330DHCX supports rate changes on the fly.

## Hardware Target

- MCU: STM32WB5MMG (Cortex-M4 @ 64MHz + Cortex-M0+ for BLE)
- Flash: 1 MB (firmware + stored sessions)
- SRAM: 256 KB (ring buffers + BLE stack)
- Power: ~10uA sleep, ~15mA active capture, ~25mA BLE streaming
