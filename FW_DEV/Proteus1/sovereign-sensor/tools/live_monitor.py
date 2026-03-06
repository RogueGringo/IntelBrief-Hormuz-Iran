#!/usr/bin/env python3
"""
Live monitor for Sovereign Sensor — connects to USB CDC and displays
incoming session data in real-time. Also monitors for captures and
saves CSV files.

Usage:
    python live_monitor.py [--port COM4] [--baud 115200] [--output-dir ./captures]
"""

import serial
import serial.tools.list_ports
import argparse
import os
import time
from datetime import datetime


def find_sovereign_sensor():
    """Auto-detect Sovereign Sensor by VID/PID."""
    for port in serial.tools.list_ports.comports():
        if port.vid == 0x0483 and port.pid == 0x5740:
            return port.device
    return None


def monitor(port_name, baud, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    print(f"Connecting to {port_name} at {baud} baud...")
    ser = serial.Serial(port_name, baud, timeout=1, dsrdtr=True)
    ser.dtr = True  # Signal host is connected
    time.sleep(0.5)

    print(f"Connected. DTR set. Waiting for session data...")
    print(f"Output directory: {output_dir}")
    print("-" * 60)

    session_lines = []
    in_session = False
    session_file = None
    session_id = None
    imu_count = 0
    impact_count = 0
    in_impact = False

    try:
        while True:
            line = ser.readline()
            if not line:
                continue

            text = line.decode("utf-8", errors="replace").strip()
            if not text:
                continue

            # Session header
            if text.startswith("# device="):
                in_session = True
                in_impact = False
                session_lines = [text]
                imu_count = 0
                impact_count = 0

                # Parse session ID
                for part in text.split(","):
                    if part.startswith("session="):
                        session_id = part.split("=")[1]

                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                fname = f"session_{session_id}_{ts}.csv"
                fpath = os.path.join(output_dir, fname)
                session_file = open(fpath, "w")
                session_file.write(text + "\n")
                print(f"\n>>> SESSION START: {text}")
                continue

            # Impact section header
            if text.startswith("# impact_section"):
                in_impact = True
                session_lines.append(text)
                if session_file:
                    session_file.write(text + "\n")
                print(f"  [Impact section: {text}]")
                continue

            # Session footer
            if text.startswith("# end session="):
                session_lines.append(text)
                if session_file:
                    session_file.write(text + "\n")
                    session_file.close()
                    session_file = None
                in_session = False
                in_impact = False
                print(f"<<< SESSION END: {imu_count} IMU + {impact_count} impact samples")
                print(f"    Saved: {fpath}")
                continue

            # Data lines
            if in_session:
                session_lines.append(text)
                if session_file:
                    session_file.write(text + "\n")

                if text.startswith("timestamp_us,") or text.startswith("impact_idx,"):
                    # Column header — skip counting
                    pass
                elif in_impact:
                    impact_count += 1
                else:
                    imu_count += 1
                    if imu_count % 500 == 0:
                        print(f"  ... {imu_count} IMU samples received")

    except KeyboardInterrupt:
        print("\nDisconnected.")
    finally:
        if session_file:
            session_file.close()
        ser.close()


def main():
    parser = argparse.ArgumentParser(description="Sovereign Sensor live monitor")
    parser.add_argument("--port", default=None, help="COM port (auto-detect if omitted)")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--output-dir", default="./captures", help="Directory for CSV files")
    args = parser.parse_args()

    port = args.port or find_sovereign_sensor()
    if not port:
        print("ERROR: Sovereign Sensor not found. Specify --port manually.")
        print("Available ports:")
        for p in serial.tools.list_ports.comports():
            print(f"  {p.device}: {p.description} (VID={p.vid:#06x}, PID={p.pid:#06x})"
                  if p.vid else f"  {p.device}: {p.description}")
        return

    monitor(port, args.baud, args.output_dir)


if __name__ == "__main__":
    main()
