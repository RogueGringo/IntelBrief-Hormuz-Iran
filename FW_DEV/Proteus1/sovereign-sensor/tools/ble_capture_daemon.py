#!/usr/bin/env python3
"""
ble_capture_daemon.py — Wireless event-driven capture daemon.

Connects to STEVAL-PROTEUS1 via BLE, arms the sensor, receives burst
swing data on trigger, converts to CSV, uploads to FastAPI backend.

Protocol:
  ARM:   write 0x01 0x01 to start monitoring
  DISARM: write 0x01 0x00
  THRESHOLD: write 0x03 <lo> <hi> (gyro mdps)

  Notifications (burst after swing detection):
    Header:  [0xFF 0xFF] [uint16 total] [uint16 rate_hz] [uint16 pre_samples]
    Data:    [uint16 seq] [int16 ax ay az gx gy gz]  (14 bytes each)
    Footer:  [0xFE 0xFE] [uint32 duration_us]
"""

import argparse
import asyncio
import csv
import struct
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from bleak import BleakClient, BleakScanner

# BLE UUIDs
P2P_WRITE_UUID  = "0000fe41-8e22-4541-9d4c-21edae82ed19"
P2P_NOTIFY_UUID = "0000fe42-8e22-4541-9d4c-21edae82ed19"

# ISM330DHCX sensitivities (±4g, 500dps)
ACCEL_MG_PER_LSB  = 0.122
GYRO_MDPS_PER_LSB = 17.50

# Defaults
DEFAULT_API = "http://localhost:8000"
DEFAULT_NAME = "P2PSRV1"
DEFAULT_THRESHOLD = 50000  # mdps
RECONNECT_DELAY = 3
SCAN_TIMEOUT = 10.0


class SwingSession:
    """Accumulates one burst swing session."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.active = False
        self.total_samples = 0
        self.rate_hz = 0
        self.pre_samples = 0
        self.packets = []
        self.duration_us = 0
        self.complete = False
        self.start_time = 0.0

    def on_header(self, data: bytes):
        self.reset()
        self.active = True
        self.start_time = time.time()
        self.total_samples = struct.unpack_from("<H", data, 2)[0]
        self.rate_hz = struct.unpack_from("<H", data, 4)[0]
        self.pre_samples = struct.unpack_from("<H", data, 6)[0]
        print(f"[*] Swing header: {self.total_samples} samples @ {self.rate_hz} Hz "
              f"({self.pre_samples} pre-trigger)")

    def on_data(self, data: bytes):
        if len(data) < 14:
            return
        seq, ax, ay, az, gx, gy, gz = struct.unpack_from("<Hhhhhhh", data, 0)
        self.packets.append((seq, ax, ay, az, gx, gy, gz))

    def on_footer(self, data: bytes):
        self.duration_us = struct.unpack_from("<I", data, 2)[0]
        self.complete = True
        self.active = False
        elapsed = time.time() - self.start_time
        print(f"[+] Swing complete: {len(self.packets)}/{self.total_samples} packets "
              f"in {elapsed:.2f}s ({self.duration_us / 1000:.1f}ms capture)")

    def to_csv(self, output_dir: Path) -> Path | None:
        if not self.complete or not self.packets:
            return None

        session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = output_dir / f"swing_{session_id}.csv"

        duration_s = self.duration_us / 1_000_000.0
        dt_us = 1_000_000.0 / self.rate_hz if self.rate_hz > 0 else 0

        with open(filepath, "w", newline="\n") as f:
            f.write(f"# device=PROTEUS1_BLE,session={session_id},"
                    f"rate_hz={self.rate_hz},source=ble,"
                    f"pre_trigger={self.pre_samples},"
                    f"mode=event\n")

            writer = csv.writer(f)
            writer.writerow([
                "timestamp_us", "accel_x_mg", "accel_y_mg", "accel_z_mg",
                "gyro_x_mdps", "gyro_y_mdps", "gyro_z_mdps",
            ])

            for seq, ax, ay, az, gx, gy, gz in self.packets:
                ts_us = int(seq * dt_us)
                writer.writerow([
                    ts_us,
                    round(ax * ACCEL_MG_PER_LSB, 1),
                    round(ay * ACCEL_MG_PER_LSB, 1),
                    round(az * ACCEL_MG_PER_LSB, 1),
                    round(gx * GYRO_MDPS_PER_LSB, 1),
                    round(gy * GYRO_MDPS_PER_LSB, 1),
                    round(gz * GYRO_MDPS_PER_LSB, 1),
                ])

            f.write(f"# end session={session_id},"
                    f"samples={len(self.packets)},"
                    f"duration={duration_s:.3f}\n")

        return filepath


def upload_csv(filepath: Path, api_base: str) -> bool:
    url = f"{api_base}/api/ingest"
    try:
        with open(filepath, "rb") as f:
            resp = requests.post(
                url, files={"file": (filepath.name, f, "text/csv")}, timeout=15
            )
        if resp.status_code == 200:
            return True
        print(f"[!] API {resp.status_code}: {resp.text[:200]}")
        return False
    except requests.ConnectionError:
        return False
    except Exception as e:
        print(f"[!] Upload error: {e}")
        return False


async def run_capture(device_addr: str, args):
    output_dir = Path(args.dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    session = SwingSession()
    swing_count = 0
    upload_queue = []

    def on_notify(_handle, data: bytearray):
        nonlocal swing_count

        if len(data) >= 8 and data[0] == 0xFF and data[1] == 0xFF:
            session.on_header(bytes(data))
        elif len(data) >= 6 and data[0] == 0xFE and data[1] == 0xFE:
            session.on_footer(bytes(data))

            # Save and upload
            filepath = session.to_csv(output_dir)
            if filepath:
                swing_count += 1
                if upload_csv(filepath, args.api):
                    print(f"    -> uploaded to API")
                else:
                    upload_queue.append(filepath)
                    print(f"    -> queued ({len(upload_queue)} in queue)")
            session.reset()
        elif session.active and len(data) >= 14:
            session.on_data(bytes(data))

    async with BleakClient(device_addr, timeout=15.0) as client:
        print(f"[+] Connected to {device_addr}, MTU={client.mtu_size}")

        await client.start_notify(P2P_NOTIFY_UUID, on_notify)

        # Set threshold
        thresh = args.threshold
        await client.write_gatt_char(
            P2P_WRITE_UUID, bytes([0x03, thresh & 0xFF, (thresh >> 8) & 0xFF])
        )
        print(f"[*] Threshold: {thresh} mdps")

        # Arm sensor
        await client.write_gatt_char(P2P_WRITE_UUID, bytes([0x01, 0x01]))
        print(f"[*] ARMED — waiting for swings... (Ctrl+C to stop)")

        try:
            while True:
                await asyncio.sleep(1.0)
                # Retry queued uploads
                if upload_queue:
                    remaining = []
                    for fp in upload_queue:
                        if fp.exists() and not upload_csv(fp, args.api):
                            remaining.append(fp)
                    upload_queue = remaining
        except asyncio.CancelledError:
            pass
        finally:
            try:
                await client.write_gatt_char(P2P_WRITE_UUID, bytes([0x01, 0x00]))
                print(f"\n[*] DISARMED")
            except Exception:
                pass
            await client.stop_notify(P2P_NOTIFY_UUID)

    return swing_count, upload_queue


async def main_async(args):
    print(f"[*] Sovereign Sensor BLE Capture Daemon (event-driven)")
    print(f"[*] API: {args.api}")
    print(f"[*] Output: {Path(args.dir).resolve()}")

    total = 0
    while True:
        # Scan
        print(f"[*] Scanning for {args.name}...")
        device = await BleakScanner.find_device_by_name(args.name, timeout=SCAN_TIMEOUT)
        if not device:
            devices = await BleakScanner.discover(timeout=SCAN_TIMEOUT)
            named = [d for d in devices if d.name]
            if named:
                print(f"[*] Found devices: {', '.join(d.name for d in named)}")
            print(f"[!] {args.name} not found. Retrying...")
            await asyncio.sleep(RECONNECT_DELAY)
            continue

        print(f"[*] Found: {device.name} ({device.address})")
        try:
            count, _ = await run_capture(device.address, args)
            total += count
        except Exception as e:
            print(f"[!] Error: {e}")

        print(f"[*] Reconnecting in {RECONNECT_DELAY}s...")
        await asyncio.sleep(RECONNECT_DELAY)


def main():
    parser = argparse.ArgumentParser(description="Sovereign Sensor BLE capture (event-driven)")
    parser.add_argument("--name", default=DEFAULT_NAME, help="BLE device name")
    parser.add_argument("--threshold", type=int, default=DEFAULT_THRESHOLD,
                        help="Gyro trigger threshold in mdps (default 50000)")
    parser.add_argument("--dir", default="./captures", help="Output directory")
    parser.add_argument("--api", default=DEFAULT_API, help="Backend API URL")
    args = parser.parse_args()

    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:
        print(f"\n[*] Stopped.")


if __name__ == "__main__":
    main()
