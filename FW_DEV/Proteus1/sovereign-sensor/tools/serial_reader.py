#!/usr/bin/env python3
"""
serial_reader.py — Host-side tool to capture CSV data from Sovereign Sensor.

Reads USB serial from the STEVAL-PROTEUS1, saves sessions as CSV files
compatible with sovereign-lib pipeline ingestion.

Usage:
    python serial_reader.py                    # auto-detect port
    python serial_reader.py --port COM3        # specific port
    python serial_reader.py --port COM3 --dir ./captures
"""

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path

import serial
import serial.tools.list_ports


def find_proteus_port() -> str | None:
    """Auto-detect Sovereign Sensor USB CDC port."""
    for port in serial.tools.list_ports.comports():
        desc = (port.description or "").lower()
        mfg = (port.manufacturer or "").lower()
        if "sovereign" in desc or "stm" in mfg or "0483:5740" in (port.hwid or ""):
            return port.device
    return None


def capture_session(ser: serial.Serial, output_dir: Path) -> Path | None:
    """Read one complete session from serial, save to CSV file."""
    lines: list[str] = []
    session_id = None
    in_session = False

    while True:
        try:
            raw = ser.readline()
        except serial.SerialException:
            print("[!] Serial connection lost")
            return None

        if not raw:
            continue

        line = raw.decode("utf-8", errors="replace").strip()
        if not line:
            continue

        # Header line starts a session
        if line.startswith("# device=") and not in_session:
            in_session = True
            lines = [line]
            # Extract session ID from header
            for part in line.split(","):
                if part.startswith("session="):
                    session_id = part.split("=")[1]
            print(f"[+] Session {session_id} started")
            continue

        if in_session:
            lines.append(line)

            # Footer line ends a session
            if line.startswith("# end session="):
                in_session = False
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"swing_{session_id}_{timestamp}.csv"
                filepath = output_dir / filename

                with open(filepath, "w", newline="\n") as f:
                    f.write("\n".join(lines) + "\n")

                sample_count = len(lines) - 3  # minus header, column names, footer
                print(f"[+] Session {session_id} saved: {filepath} ({sample_count} samples)")
                return filepath


def main():
    parser = argparse.ArgumentParser(description="Sovereign Sensor serial capture")
    parser.add_argument("--port", help="Serial port (auto-detect if omitted)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate")
    parser.add_argument("--dir", default="./captures", help="Output directory")
    parser.add_argument("--continuous", action="store_true",
                        help="Keep capturing sessions until Ctrl+C")
    args = parser.parse_args()

    # Find port
    port = args.port or find_proteus_port()
    if not port:
        print("[!] No Sovereign Sensor found. Connect the board or specify --port")
        sys.exit(1)

    # Ensure output directory
    output_dir = Path(args.dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"[*] Sovereign Sensor Serial Reader")
    print(f"[*] Port: {port} @ {args.baud}")
    print(f"[*] Output: {output_dir.resolve()}")
    print(f"[*] Waiting for swing data...")

    try:
        ser = serial.Serial(port, args.baud, timeout=1)
    except serial.SerialException as e:
        print(f"[!] Cannot open {port}: {e}")
        sys.exit(1)

    try:
        session_count = 0
        while True:
            filepath = capture_session(ser, output_dir)
            if filepath:
                session_count += 1
                print(f"[*] Total sessions captured: {session_count}")

            if not args.continuous:
                break

    except KeyboardInterrupt:
        print(f"\n[*] Stopped. {session_count} sessions captured.")
    finally:
        ser.close()


if __name__ == "__main__":
    main()
