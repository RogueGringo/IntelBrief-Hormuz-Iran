#!/usr/bin/env python3
"""
ble_capture_daemon.py — Wireless auto-ingest daemon for Sovereign Sensor.

Connects to the STEVAL-PROTEUS1 via BLE (P2P Server service), starts IMU
streaming, reassembles 14-byte notification packets into CSV sessions,
and uploads them to the FastAPI backend.

Usage:
    python ble_capture_daemon.py                        # auto-scan for P2PSRV1
    python ble_capture_daemon.py --name P2PSRV1         # specific device name
    python ble_capture_daemon.py --addr AA:BB:CC:DD:EE  # specific BLE address
    python ble_capture_daemon.py --api http://host:8000  # custom API URL
"""

import argparse
import asyncio
import csv
import io
import struct
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from bleak import BleakClient, BleakScanner

# ─── BLE UUIDs (P2P Server service) ─────────────────────────
P2P_SERVICE_UUID = "0000fe40-cc7a-482a-984a-7f2ed5b3e58f"
P2P_WRITE_UUID   = "0000fe41-8e22-4541-9d4c-21edae82ed19"
P2P_NOTIFY_UUID  = "0000fe42-8e22-4541-9d4c-21edae82ed19"

# ─── DEFAULTS ────────────────────────────────────────────────
DEFAULT_API = "http://localhost:8000"
DEFAULT_NAME = "P2PSRV1"
DEFAULT_RATE_HZ = 100    # 100 Hz = zero packet loss over BLE
RECONNECT_DELAY = 3
RETRY_DELAY = 10
SESSION_TIMEOUT = 5.0   # seconds of silence to end a session
SCAN_TIMEOUT = 10.0     # BLE scan duration


class BLECaptureSession:
    """Collects BLE notification packets into a CSV session."""

    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.packets = []
        self.last_packet_time = 0.0
        self.session_active = False
        self.session_id = ""
        self.start_time = 0.0
        self.missed_packets = 0
        self.last_seq = -1

    def start(self):
        self.packets = []
        self.last_seq = -1
        self.missed_packets = 0
        self.session_active = True
        self.start_time = time.time()
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.last_packet_time = time.time()

    def add_packet(self, data: bytes):
        """Parse a 14-byte IMU notification packet."""
        if len(data) < 14:
            return

        self.last_packet_time = time.time()

        seq, ax, ay, az, gx, gy, gz = struct.unpack_from("<Hhhhhhh", data, 0)

        # Track sequence gaps
        if self.last_seq >= 0:
            expected = (self.last_seq + 1) & 0xFFFF
            if seq != expected:
                gap = (seq - expected) & 0xFFFF
                self.missed_packets += gap
        self.last_seq = seq

        elapsed_ms = (time.time() - self.start_time) * 1000.0
        self.packets.append({
            "seq": seq,
            "time_ms": round(elapsed_ms, 1),
            "ax": ax, "ay": ay, "az": az,
            "gx": gx, "gy": gy, "gz": gz,
        })

    def finalize(self) -> Path | None:
        """Write accumulated packets to CSV. Returns filepath or None."""
        if not self.packets:
            return None

        self.session_active = False
        duration = time.time() - self.start_time

        filename = f"ble_swing_{self.session_id}.csv"
        filepath = self.output_dir / filename

        with open(filepath, "w", newline="\n") as f:
            # Header compatible with sovereign-lib ingest
            f.write(f"# device=PROTEUS1_BLE,session={self.session_id},"
                    f"rate_hz=500,source=ble\n")
            writer = csv.DictWriter(f, fieldnames=[
                "seq", "time_ms", "ax", "ay", "az", "gx", "gy", "gz"
            ])
            writer.writeheader()
            writer.writerows(self.packets)
            f.write(f"# end session={self.session_id},samples={len(self.packets)},"
                    f"missed={self.missed_packets},duration={duration:.2f}\n")

        return filepath


def upload_csv(filepath: Path, api_base: str) -> bool:
    """POST CSV to /api/ingest."""
    url = f"{api_base}/api/ingest"
    try:
        with open(filepath, "rb") as f:
            resp = requests.post(
                url, files={"file": (filepath.name, f, "text/csv")}, timeout=15
            )
        if resp.status_code == 200:
            return True
        print(f"[!] API returned {resp.status_code}: {resp.text[:200]}")
        return False
    except requests.ConnectionError:
        return False
    except Exception as e:
        print(f"[!] Upload error: {e}")
        return False


def retry_queued(queue: list, api_base: str) -> list:
    """Retry uploading queued files."""
    remaining = []
    for fp in queue:
        if fp.exists() and not upload_csv(fp, api_base):
            remaining.append(fp)
        elif fp.exists():
            print(f"[+] Queued file uploaded: {fp.name}")
    return remaining


async def scan_for_device(name: str | None, addr: str | None) -> str | None:
    """Scan for BLE device, return address."""
    print(f"[*] Scanning for BLE device (timeout={SCAN_TIMEOUT}s)...")
    devices = await BleakScanner.discover(timeout=SCAN_TIMEOUT)

    for d in devices:
        if addr and d.address.upper() == addr.upper():
            print(f"[*] Found device by address: {d.name} ({d.address})")
            return d.address
        if name and d.name and name.lower() in d.name.lower():
            print(f"[*] Found device by name: {d.name} ({d.address})")
            return d.address

    # Show what we found
    p2p_devices = [d for d in devices if d.name and "P2P" in d.name.upper()]
    if p2p_devices:
        print(f"[*] Found P2P devices but no match:")
        for d in p2p_devices:
            print(f"    {d.name} ({d.address})")
    else:
        stm_devices = [d for d in devices if d.name and "STM" in d.name.upper()]
        if stm_devices:
            print(f"[*] Found STM devices:")
            for d in stm_devices:
                print(f"    {d.name} ({d.address})")

    return None


async def run_capture(device_addr: str, args):
    """Connect to device, start streaming, capture sessions."""
    output_dir = Path(args.dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    session = BLECaptureSession(output_dir)
    session_count = 0
    upload_queue = []
    streaming = False

    def on_notify(_handle, data: bytearray):
        nonlocal streaming
        if not session.session_active:
            session.start()
            streaming = True
            print(f"[*] Session started (receiving packets...)")
        session.add_packet(bytes(data))

    async with BleakClient(device_addr, timeout=15.0) as client:
        print(f"[+] Connected to {device_addr}")
        print(f"    MTU: {client.mtu_size}")

        # Subscribe to notifications
        await client.start_notify(P2P_NOTIFY_UUID, on_notify)
        print(f"[*] Subscribed to IMU notifications")

        # Set streaming rate
        rate_hz = args.rate
        rate_bytes = bytes([0x02, rate_hz & 0xFF, (rate_hz >> 8) & 0xFF])
        await client.write_gatt_char(P2P_WRITE_UUID, rate_bytes)
        print(f"[*] Set rate to {rate_hz} Hz")
        await asyncio.sleep(0.1)

        # Send start command: 0x01 0x01
        await client.write_gatt_char(P2P_WRITE_UUID, bytes([0x01, 0x01]))
        print(f"[*] Sent START command")
        print(f"[*] Streaming... (Ctrl+C to stop)")

        try:
            while True:
                await asyncio.sleep(0.5)

                # Check for session timeout (gap in packets)
                if session.session_active and session.packets:
                    idle = time.time() - session.last_packet_time
                    if idle > SESSION_TIMEOUT:
                        # End current session
                        filepath = session.finalize()
                        if filepath:
                            session_count += 1
                            n = len(session.packets) if hasattr(session, '_last_count') else 0
                            # Re-read from file for count
                            pkt_count = session.last_seq + 1 if session.last_seq >= 0 else 0
                            missed = session.missed_packets
                            print(f"[+] Session {session_count:04d}: "
                                  f"{len(session.packets)} packets received"
                                  f" ({missed} missed) -> {filepath.name}")

                            if upload_csv(filepath, args.api):
                                print(f"    -> uploaded to API")
                            else:
                                upload_queue.append(filepath)
                                print(f"    -> queued (API unavailable, "
                                      f"{len(upload_queue)} in queue)")

                        streaming = False

                # Retry queued uploads periodically
                if upload_queue:
                    upload_queue = retry_queued(upload_queue, args.api)

        except asyncio.CancelledError:
            pass
        finally:
            # Send stop command
            try:
                await client.write_gatt_char(P2P_WRITE_UUID, bytes([0x01, 0x00]))
                print(f"\n[*] Sent STOP command")
            except Exception:
                pass

            # Finalize any in-progress session
            if session.session_active:
                filepath = session.finalize()
                if filepath:
                    session_count += 1
                    print(f"[+] Final session: {len(session.packets)} packets "
                          f"-> {filepath.name}")
                    if upload_csv(filepath, args.api):
                        print(f"    -> uploaded to API")
                    else:
                        upload_queue.append(filepath)

            await client.stop_notify(P2P_NOTIFY_UUID)

    return session_count, upload_queue


async def main_async(args):
    """Main async loop with reconnection."""
    print(f"[*] Sovereign Sensor BLE Capture Daemon")
    print(f"[*] API: {args.api}")
    print(f"[*] Output: {Path(args.dir).resolve()}")

    total_sessions = 0

    while True:
        # Scan for device
        device_addr = args.addr
        if not device_addr:
            device_addr = await scan_for_device(args.name, None)
        if not device_addr:
            print(f"[!] Device not found. Retrying in {RECONNECT_DELAY}s...")
            await asyncio.sleep(RECONNECT_DELAY)
            continue

        # Connect and capture
        try:
            count, queue = await run_capture(device_addr, args)
            total_sessions += count
        except Exception as e:
            print(f"[!] BLE error: {e}")

        print(f"[*] Disconnected. Reconnecting in {RECONNECT_DELAY}s...")
        await asyncio.sleep(RECONNECT_DELAY)


def main():
    parser = argparse.ArgumentParser(
        description="Sovereign Sensor BLE capture daemon"
    )
    parser.add_argument("--name", default=DEFAULT_NAME,
                        help="BLE device name to scan for")
    parser.add_argument("--addr", help="BLE device address (skip scan)")
    parser.add_argument("--dir", default="./captures",
                        help="Output directory for CSV files")
    parser.add_argument("--rate", type=int, default=DEFAULT_RATE_HZ,
                        help="Streaming rate in Hz (default 100, max lossless)")
    parser.add_argument("--api", default=DEFAULT_API,
                        help="Backend API base URL")
    args = parser.parse_args()

    try:
        asyncio.run(main_async(args))
    except KeyboardInterrupt:
        print(f"\n[*] Stopped.")


if __name__ == "__main__":
    main()
