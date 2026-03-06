#!/usr/bin/env python3
"""
capture_daemon.py — Auto-ingest daemon for Sovereign Sensor.

Bridges firmware USB serial output to the FastAPI backend by combining
serial capture with automatic API upload. Runs continuously, reconnects
on serial loss, and queues files when the API is unavailable.

Usage:
    python capture_daemon.py                        # auto-detect port
    python capture_daemon.py --port COM3            # specific port
    python capture_daemon.py --api http://host:7860 # custom API URL
"""

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
import serial
import serial.tools.list_ports

# ─── DEFAULTS ────────────────────────────────────────────────
DEFAULT_API = "http://localhost:8000"
DEFAULT_BAUD = 115200
RECONNECT_DELAY = 3        # seconds between serial reconnect attempts
RETRY_DELAY = 10           # seconds between API retry sweeps
VID_PID = "0483:5740"      # STMicro CDC ACM


def find_proteus_port():
    """Auto-detect Sovereign Sensor USB CDC port."""
    for port in serial.tools.list_ports.comports():
        desc = (port.description or "").lower()
        mfg = (port.manufacturer or "").lower()
        hwid = (port.hwid or "").upper()
        if "sovereign" in desc or "stm" in mfg or VID_PID.upper() in hwid:
            return port.device
    return None


def open_serial(port_name, baud):
    """Open serial port with DTR enabled, return Serial object or None."""
    try:
        ser = serial.Serial(port_name, baud, timeout=1, dsrdtr=True)
        ser.dtr = True  # Signal host connected — firmware needs DTR to send
        print(f"[*] Serial connected: {port_name} @ {baud} (DTR=on)")
        return ser
    except serial.SerialException as e:
        print(f"[!] Cannot open {port_name}: {e}")
        return None


def capture_session(ser):
    """Read one complete session from serial. Returns (lines, session_id) or (None, None)."""
    lines = []
    session_id = None
    in_session = False

    while True:
        try:
            raw = ser.readline()
        except serial.SerialException:
            print("[!] Serial connection lost during capture")
            return None, None

        if not raw:
            continue

        line = raw.decode("utf-8", errors="replace").strip()
        if not line:
            continue

        # Header line starts a session
        if line.startswith("# device=") and not in_session:
            in_session = True
            lines = [line]
            for part in line.split(","):
                if part.startswith("session="):
                    session_id = part.split("=")[1]
            continue

        if in_session:
            lines.append(line)

            # Footer line ends a session
            if line.startswith("# end session="):
                return lines, session_id


def save_csv(lines, session_id, output_dir):
    """Write captured lines to a CSV file, return the filepath."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"swing_{session_id}_{timestamp}.csv"
    filepath = output_dir / filename

    with open(filepath, "w", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    return filepath


def upload_csv(filepath, api_base):
    """POST CSV to /api/ingest. Returns True on success, False on failure."""
    url = f"{api_base}/api/ingest"
    try:
        with open(filepath, "rb") as f:
            resp = requests.post(url, files={"file": (filepath.name, f, "text/csv")}, timeout=15)
        if resp.status_code == 200:
            return True
        else:
            print(f"[!] API returned {resp.status_code}: {resp.text[:200]}")
            return False
    except requests.ConnectionError:
        return False
    except requests.Timeout:
        print("[!] API request timed out")
        return False
    except Exception as e:
        print(f"[!] Upload error: {e}")
        return False


def retry_queued(upload_queue, api_base):
    """Try uploading any queued files. Returns remaining queue."""
    if not upload_queue:
        return upload_queue

    still_queued = []
    for filepath in upload_queue:
        if not filepath.exists():
            continue
        if upload_csv(filepath, api_base):
            print(f"[+] Queued file uploaded: {filepath.name}")
        else:
            still_queued.append(filepath)

    if still_queued and len(still_queued) < len(upload_queue):
        print(f"[*] {len(upload_queue) - len(still_queued)} queued files uploaded, {len(still_queued)} remaining")

    return still_queued


def main():
    parser = argparse.ArgumentParser(description="Sovereign Sensor capture daemon")
    parser.add_argument("--port", help="Serial port (auto-detect if omitted)")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD, help="Baud rate")
    parser.add_argument("--dir", default="./captures", help="Output directory for CSV files")
    parser.add_argument("--api", default=DEFAULT_API, help="Backend API base URL")
    args = parser.parse_args()

    output_dir = Path(args.dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"[*] Sovereign Sensor Capture Daemon")
    print(f"[*] API: {args.api}")
    print(f"[*] Output: {output_dir.resolve()}")

    session_count = 0
    upload_queue = []
    last_retry = 0

    try:
        while True:
            # ── Find / open serial port ──────────────────────
            port_name = args.port or find_proteus_port()
            if not port_name:
                print("[!] No Sovereign Sensor found. Retrying in {}s...".format(RECONNECT_DELAY))
                time.sleep(RECONNECT_DELAY)
                continue

            ser = open_serial(port_name, args.baud)
            if ser is None:
                time.sleep(RECONNECT_DELAY)
                continue

            print(f"[*] Waiting for swing data...")

            # ── Capture loop on this connection ──────────────
            try:
                while True:
                    # Periodically retry queued uploads between sessions
                    now = time.time()
                    if upload_queue and now - last_retry > RETRY_DELAY:
                        upload_queue = retry_queued(upload_queue, args.api)
                        last_retry = now

                    lines, session_id = capture_session(ser)

                    if lines is None:
                        # Serial lost — break to reconnect loop
                        break

                    # Save CSV locally
                    sample_count = len(lines) - 3  # minus header, column names, footer
                    filepath = save_csv(lines, session_id, output_dir)

                    # Parse duration from footer if available
                    duration_str = ""
                    footer = lines[-1]
                    for part in footer.split(","):
                        part = part.strip()
                        if part.startswith("duration="):
                            duration_str = f", {part.split('=')[1]}s"
                            break

                    # Upload to API
                    session_count += 1
                    tag = f"{session_count:04d}"

                    if upload_csv(filepath, args.api):
                        print(f"[+] Session {tag} captured ({sample_count} samples{duration_str}) -> uploaded to API")
                    else:
                        upload_queue.append(filepath)
                        print(f"[+] Session {tag} captured ({sample_count} samples{duration_str}) -> queued (API unavailable, {len(upload_queue)} in queue)")

            except serial.SerialException:
                print("[!] Serial error, will reconnect...")
            finally:
                try:
                    ser.close()
                except Exception:
                    pass

            print(f"[*] Reconnecting in {RECONNECT_DELAY}s...")
            time.sleep(RECONNECT_DELAY)

    except KeyboardInterrupt:
        # Final retry of any queued files
        if upload_queue:
            print(f"\n[*] Flushing {len(upload_queue)} queued files...")
            upload_queue = retry_queued(upload_queue, args.api)
            if upload_queue:
                print(f"[!] {len(upload_queue)} files still queued (saved locally in {output_dir.resolve()}):")
                for fp in upload_queue:
                    print(f"    {fp.name}")

        print(f"\n[*] Stopped. {session_count} sessions captured.")


if __name__ == "__main__":
    main()
