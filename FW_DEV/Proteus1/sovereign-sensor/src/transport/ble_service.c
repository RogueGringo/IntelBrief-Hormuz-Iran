/*
 * BLE GATT service for Sovereign Sensor.
 *
 * Custom service UUID: 00001820-0000-1000-8000-00805f9b34fb (based on Automation IO)
 * Characteristics:
 *   - Swing Status (notify): current capture state + session info
 *   - IMU Data (notify): latest IMU sample at reduced rate for live monitoring
 *   - Config (read/write): threshold, sample rate, capture mode
 */

#include <zephyr/kernel.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/logging/log.h>
#include <string.h>
#include "sensor_config.h"
#include "capture.h"

LOG_MODULE_REGISTER(ble_svc, LOG_LEVEL_INF);

/* Custom Sovereign Sensor Service UUID */
#define BT_UUID_SOVEREIGN_VAL \
    BT_UUID_128_ENCODE(0x53565353, 0x0001, 0x1000, 0x8000, 0x00805f9b34fb)
#define BT_UUID_SOVEREIGN BT_UUID_DECLARE_128(BT_UUID_SOVEREIGN_VAL)

/* Characteristic UUIDs */
#define BT_UUID_SVS_STATUS_VAL \
    BT_UUID_128_ENCODE(0x53565353, 0x0002, 0x1000, 0x8000, 0x00805f9b34fb)
#define BT_UUID_SVS_STATUS BT_UUID_DECLARE_128(BT_UUID_SVS_STATUS_VAL)

#define BT_UUID_SVS_IMU_VAL \
    BT_UUID_128_ENCODE(0x53565353, 0x0003, 0x1000, 0x8000, 0x00805f9b34fb)
#define BT_UUID_SVS_IMU BT_UUID_DECLARE_128(BT_UUID_SVS_IMU_VAL)

#define BT_UUID_SVS_CONFIG_VAL \
    BT_UUID_128_ENCODE(0x53565353, 0x0004, 0x1000, 0x8000, 0x00805f9b34fb)
#define BT_UUID_SVS_CONFIG BT_UUID_DECLARE_128(BT_UUID_SVS_CONFIG_VAL)

static bool ble_connected = false;
static bool status_notify_enabled = false;
static bool imu_notify_enabled = false;
static struct bt_conn *current_conn = NULL;

/* Packed status for BLE notification (8 bytes) */
struct __packed ble_status_pkt {
    uint8_t state;          /* capture_state enum */
    uint8_t usb_connected;  /* USB CDC connected */
    uint16_t session_id;    /* current session */
    uint16_t sample_count;  /* samples in current session (capped 65535) */
    uint16_t ring_count;    /* ring buffer occupancy */
};

/* Packed IMU sample for BLE notification (14 bytes) */
struct __packed ble_imu_pkt {
    uint32_t timestamp_us;
    int16_t accel_x_mg;
    int16_t accel_y_mg;
    int16_t accel_z_mg;
    int16_t gyro_x_mdps_div10; /* /10 to fit int16 */
};

/* Config structure (read/write, 8 bytes) */
struct __packed ble_config_pkt {
    uint16_t sample_rate_hz;
    uint16_t threshold_mg;
    uint8_t capture_mode;    /* 0=manual, 1=threshold */
    uint8_t capture_duration_s;
    uint8_t preroll_s;
    uint8_t reserved;
};

/* CCC changed callbacks */
static void status_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    status_notify_enabled = (value == BT_GATT_CCC_NOTIFY);
    LOG_INF("BLE status notifications %s", status_notify_enabled ? "enabled" : "disabled");
}

static void imu_ccc_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    imu_notify_enabled = (value == BT_GATT_CCC_NOTIFY);
    LOG_INF("BLE IMU notifications %s", imu_notify_enabled ? "enabled" : "disabled");
}

/* Config read callback */
static ssize_t config_read(struct bt_conn *conn,
                           const struct bt_gatt_attr *attr,
                           void *buf, uint16_t len, uint16_t offset)
{
    /* Return current config — caller provides runtime_config externally */
    struct ble_config_pkt cfg = {
        .sample_rate_hz = DEFAULT_SAMPLE_RATE_HZ,
        .threshold_mg = DEFAULT_WAKE_THRESHOLD_MG,
        .capture_mode = 1,
        .capture_duration_s = DEFAULT_CAPTURE_DURATION_S,
        .preroll_s = DEFAULT_PREROLL_S,
        .reserved = 0,
    };
    return bt_gatt_attr_read(conn, attr, buf, len, offset, &cfg, sizeof(cfg));
}

/* Config write callback */
static ssize_t config_write(struct bt_conn *conn,
                            const struct bt_gatt_attr *attr,
                            const void *buf, uint16_t len,
                            uint16_t offset, uint8_t flags)
{
    if (len != sizeof(struct ble_config_pkt)) {
        return BT_GATT_ERR(BT_ATT_ERR_INVALID_ATTRIBUTE_LEN);
    }

    struct ble_config_pkt *cfg = (struct ble_config_pkt *)buf;
    LOG_INF("BLE config write: rate=%u thresh=%u mode=%u",
            cfg->sample_rate_hz, cfg->threshold_mg, cfg->capture_mode);

    /* Apply config changes */
    if (cfg->threshold_mg > 0) {
        swing_detect_set_threshold(cfg->threshold_mg);
    }

    return len;
}

/* GATT Service Definition */
BT_GATT_SERVICE_DEFINE(sovereign_svc,
    BT_GATT_PRIMARY_SERVICE(BT_UUID_SOVEREIGN),

    /* Status characteristic (notify) */
    BT_GATT_CHARACTERISTIC(BT_UUID_SVS_STATUS,
                           BT_GATT_CHRC_NOTIFY,
                           BT_GATT_PERM_NONE,
                           NULL, NULL, NULL),
    BT_GATT_CCC(status_ccc_changed, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),

    /* IMU data characteristic (notify) */
    BT_GATT_CHARACTERISTIC(BT_UUID_SVS_IMU,
                           BT_GATT_CHRC_NOTIFY,
                           BT_GATT_PERM_NONE,
                           NULL, NULL, NULL),
    BT_GATT_CCC(imu_ccc_changed, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),

    /* Config characteristic (read/write) */
    BT_GATT_CHARACTERISTIC(BT_UUID_SVS_CONFIG,
                           BT_GATT_CHRC_READ | BT_GATT_CHRC_WRITE,
                           BT_GATT_PERM_READ | BT_GATT_PERM_WRITE,
                           config_read, config_write, NULL),
);

/* Connection callbacks */
static void connected(struct bt_conn *conn, uint8_t err)
{
    if (err) {
        LOG_ERR("BLE connection failed (err %u)", err);
        return;
    }
    current_conn = bt_conn_ref(conn);
    ble_connected = true;
    LOG_INF("BLE connected");
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
    LOG_INF("BLE disconnected (reason %u)", reason);
    if (current_conn) {
        bt_conn_unref(current_conn);
        current_conn = NULL;
    }
    ble_connected = false;
    status_notify_enabled = false;
    imu_notify_enabled = false;
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
    .connected = connected,
    .disconnected = disconnected,
};

/* Advertising data */
static const struct bt_data ad[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
    BT_DATA(BT_DATA_NAME_COMPLETE, CONFIG_BT_DEVICE_NAME, sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

static const struct bt_data sd[] = {
    BT_DATA_BYTES(BT_DATA_UUID128_ALL, BT_UUID_SOVEREIGN_VAL),
};

/* Public API */

int ble_service_init(void)
{
    int err = bt_enable(NULL);
    if (err) {
        LOG_ERR("BLE init failed (err %d)", err);
        return err;
    }

    LOG_INF("BLE initialized");

    err = bt_le_adv_start(BT_LE_ADV_CONN, ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));
    if (err) {
        LOG_ERR("BLE advertising failed (err %d)", err);
        return err;
    }

    LOG_INF("BLE advertising as '%s'", CONFIG_BT_DEVICE_NAME);
    return 0;
}

bool ble_is_connected(void)
{
    return ble_connected;
}

int ble_notify_status(uint8_t state, bool usb_connected,
                      uint16_t session_id, uint32_t sample_count,
                      int ring_count)
{
    if (!ble_connected || !status_notify_enabled) return -ENODEV;

    struct ble_status_pkt pkt = {
        .state = state,
        .usb_connected = usb_connected ? 1 : 0,
        .session_id = session_id,
        .sample_count = (sample_count > 65535) ? 65535 : (uint16_t)sample_count,
        .ring_count = (ring_count > 65535) ? 65535 : (uint16_t)ring_count,
    };

    return bt_gatt_notify(current_conn, &sovereign_svc.attrs[1],
                          &pkt, sizeof(pkt));
}

int ble_notify_imu(const struct imu_sample *sample)
{
    if (!ble_connected || !imu_notify_enabled) return -ENODEV;

    struct ble_imu_pkt pkt = {
        .timestamp_us = sample->timestamp_us,
        .accel_x_mg = (int16_t)sample->accel_x_mg,
        .accel_y_mg = (int16_t)sample->accel_y_mg,
        .accel_z_mg = (int16_t)sample->accel_z_mg,
        .gyro_x_mdps_div10 = (int16_t)(sample->gyro_x_mdps / 10),
    };

    return bt_gatt_notify(current_conn, &sovereign_svc.attrs[4],
                          &pkt, sizeof(pkt));
}
