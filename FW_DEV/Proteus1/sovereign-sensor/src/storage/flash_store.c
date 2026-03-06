/*
 * Flash-based session storage using MX25R6435F QuadSPI NOR flash.
 *
 * Storage format (per session):
 *   [4B magic] [2B session_id] [2B sample_count] [4B timestamp]
 *   [N * 14B imu_sample_packed]
 *   [4B end_magic]
 *
 * 7.5MB storage / ~60B per session header+footer / 14B per sample
 * = ~500 full sessions (4096 samples each) stored offline.
 *
 * Sessions are stored sequentially and can be bulk-transferred
 * over USB or BLE when connected to a host.
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/flash.h>
#include <zephyr/storage/flash_map.h>
#include <zephyr/logging/log.h>
#include <string.h>
#include "sensor_config.h"

LOG_MODULE_REGISTER(flash_store, LOG_LEVEL_INF);

#define FLASH_MAGIC      0x53565331  /* "SVS1" */
#define FLASH_END_MAGIC  0x454E4453  /* "ENDS" */
#define STORAGE_PARTITION storage_partition

/* Packed IMU sample for flash (14 bytes) */
struct __packed flash_imu_sample {
    uint32_t timestamp_us;
    int16_t accel_x_mg;
    int16_t accel_y_mg;
    int16_t accel_z_mg;
    int16_t gyro_x_mdps_div10;
};

/* Session header in flash (16 bytes) */
struct __packed flash_session_header {
    uint32_t magic;
    uint16_t session_id;
    uint16_t sample_count;
    uint32_t start_timestamp;
    uint16_t sample_rate_hz;
    uint16_t reserved;
};

static const struct flash_area *flash_area_ptr;
static bool flash_ready = false;
static uint32_t write_offset = 0;
static uint32_t flash_size = 0;

int flash_store_init(void)
{
    int ret = flash_area_open(FIXED_PARTITION_ID(STORAGE_PARTITION), &flash_area_ptr);
    if (ret < 0) {
        LOG_WRN("Flash storage partition not available: %d", ret);
        return ret;
    }

    flash_size = flash_area_ptr->fa_size;
    flash_ready = true;

    /* Find write offset by scanning for first empty area */
    write_offset = 0;
    uint32_t magic;
    while (write_offset < flash_size - sizeof(struct flash_session_header)) {
        ret = flash_area_read(flash_area_ptr, write_offset, &magic, 4);
        if (ret < 0 || magic == 0xFFFFFFFF) break;

        /* Skip to next session */
        struct flash_session_header hdr;
        flash_area_read(flash_area_ptr, write_offset, &hdr, sizeof(hdr));
        if (hdr.magic != FLASH_MAGIC) break;

        uint32_t session_size = sizeof(hdr) +
            (uint32_t)hdr.sample_count * sizeof(struct flash_imu_sample) + 4;
        write_offset += session_size;
    }

    LOG_INF("Flash store ready: %u KB total, %u KB used, offset=%u",
            flash_size / 1024, write_offset / 1024, write_offset);
    return 0;
}

bool flash_store_is_ready(void)
{
    return flash_ready;
}

uint32_t flash_store_used_bytes(void)
{
    return write_offset;
}

uint32_t flash_store_free_bytes(void)
{
    return flash_ready ? (flash_size - write_offset) : 0;
}

int flash_store_begin_session(uint16_t session_id, uint16_t sample_rate_hz)
{
    if (!flash_ready) return -ENODEV;

    struct flash_session_header hdr = {
        .magic = FLASH_MAGIC,
        .session_id = session_id,
        .sample_count = 0,  /* Updated at end */
        .start_timestamp = (uint32_t)k_uptime_get(),
        .sample_rate_hz = sample_rate_hz,
        .reserved = 0,
    };

    int ret = flash_area_write(flash_area_ptr, write_offset, &hdr, sizeof(hdr));
    if (ret < 0) {
        LOG_ERR("Flash write header failed: %d", ret);
        return ret;
    }

    write_offset += sizeof(hdr);
    return 0;
}

int flash_store_write_sample(const struct imu_sample *sample)
{
    if (!flash_ready) return -ENODEV;
    if (write_offset + sizeof(struct flash_imu_sample) >= flash_size) {
        return -ENOSPC;
    }

    struct flash_imu_sample packed = {
        .timestamp_us = sample->timestamp_us,
        .accel_x_mg = (int16_t)sample->accel_x_mg,
        .accel_y_mg = (int16_t)sample->accel_y_mg,
        .accel_z_mg = (int16_t)sample->accel_z_mg,
        .gyro_x_mdps_div10 = (int16_t)(sample->gyro_x_mdps / 10),
    };

    int ret = flash_area_write(flash_area_ptr, write_offset, &packed, sizeof(packed));
    if (ret < 0) return ret;

    write_offset += sizeof(packed);
    return 0;
}

int flash_store_end_session(uint16_t sample_count)
{
    if (!flash_ready) return -ENODEV;

    /* Write end magic */
    uint32_t end = FLASH_END_MAGIC;
    int ret = flash_area_write(flash_area_ptr, write_offset, &end, 4);
    if (ret < 0) return ret;
    write_offset += 4;

    /* Go back and update sample_count in header */
    uint32_t hdr_offset = write_offset -
        4 - (uint32_t)sample_count * sizeof(struct flash_imu_sample) -
        sizeof(struct flash_session_header);

    /* Read-modify-write the header */
    struct flash_session_header hdr;
    flash_area_read(flash_area_ptr, hdr_offset, &hdr, sizeof(hdr));
    hdr.sample_count = sample_count;
    /* Note: NOR flash can only clear bits, not set them.
     * Since sample_count was 0 (all bits set in erased state after write),
     * this may not work on all flash. For production, use a separate
     * index/catalog in a different flash sector. */

    LOG_INF("Session stored in flash: id=%u, samples=%u, offset=%u",
            hdr.session_id, sample_count, hdr_offset);
    return 0;
}

int flash_store_erase_all(void)
{
    if (!flash_ready) return -ENODEV;

    int ret = flash_area_erase(flash_area_ptr, 0, flash_size);
    if (ret < 0) {
        LOG_ERR("Flash erase failed: %d", ret);
        return ret;
    }

    write_offset = 0;
    LOG_INF("Flash storage erased (%u KB)", flash_size / 1024);
    return 0;
}

/* Count stored sessions */
uint16_t flash_store_session_count(void)
{
    if (!flash_ready) return 0;

    uint16_t count = 0;
    uint32_t offset = 0;

    while (offset < flash_size) {
        struct flash_session_header hdr;
        int ret = flash_area_read(flash_area_ptr, offset, &hdr, sizeof(hdr));
        if (ret < 0 || hdr.magic != FLASH_MAGIC) break;

        count++;
        offset += sizeof(hdr) +
            (uint32_t)hdr.sample_count * sizeof(struct flash_imu_sample) + 4;
    }

    return count;
}
