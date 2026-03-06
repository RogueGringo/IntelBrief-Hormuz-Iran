cmake_minimum_required(VERSION 3.20.0)
find_package(Zephyr REQUIRED HINTS $ENV{ZEPHYR_BASE})

project(sovereign-sensor)

target_sources(app PRIVATE
    src/main.c
    src/sensors/ism330dhcx.c
    src/sensors/impact_detect.c
    src/sensors/environment.c
    src/capture/ring_buffer.c
    src/capture/swing_detect.c
    src/capture/session.c
    src/transport/usb_serial.c
    src/transport/protocol.c
    src/transport/ble_service.c
)

target_include_directories(app PRIVATE include)
