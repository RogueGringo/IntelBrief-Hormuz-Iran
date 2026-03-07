"""
Display engine — rich terminal UI with ASCII graphics, sparklines, and live gauges.
No external deps beyond stdlib + psutil.
"""

import os
import sys
import shutil
import time
from datetime import datetime, timezone

# ── Terminal helpers ────────────────────────────────────────────────

C = {
    "R": "\033[0;31m", "G": "\033[0;32m", "Y": "\033[1;33m",
    "C": "\033[0;36m", "B": "\033[0;34m", "M": "\033[0;35m",
    "W": "\033[1;37m", "D": "\033[2m", "BOLD": "\033[1m",
    "UL": "\033[4m", "X": "\033[0m",
    "BG_R": "\033[41m", "BG_G": "\033[42m", "BG_Y": "\033[43m",
    "BG_B": "\033[44m", "BG_C": "\033[46m",
}


def w():
    """Terminal width."""
    return shutil.get_terminal_size((80, 24)).columns


def clear():
    os.system("cls" if os.name == "nt" else "clear")


def ctext(text, width=None):
    """Center text."""
    width = width or w()
    return text.center(width)


def hline(char="─", color="D"):
    print(f"  {C[color]}{char * (w() - 4)}{C['X']}")


def box_top(title="", width=None):
    width = width or w() - 4
    if title:
        pad = width - len(title) - 4
        left = pad // 2
        right = pad - left
        print(f"  {C['C']}╔{'═' * left} {title} {'═' * right}╗{C['X']}")
    else:
        print(f"  {C['C']}╔{'═' * (width - 2)}╗{C['X']}")


def box_row(text, width=None, color="W"):
    width = width or w() - 4
    # Strip ANSI for length calc
    import re
    clean = re.sub(r'\033\[[0-9;]*m', '', text)
    pad = width - len(clean) - 4
    if pad < 0:
        pad = 0
    print(f"  {C['C']}║{C['X']} {C[color]}{text}{C['X']}{' ' * pad} {C['C']}║{C['X']}")


def box_bot(width=None):
    width = width or w() - 4
    print(f"  {C['C']}╚{'═' * (width - 2)}╝{C['X']}")


# ── Sparkline chart ────────────────────────────────────────────────
SPARK_CHARS = "▁▂▃▄▅▆▇█"


def sparkline(data, width=40):
    """Render a sparkline from a list of numbers."""
    if not data:
        return C["D"] + "─" * width + C["X"]
    mn, mx = min(data), max(data)
    rng = mx - mn if mx != mn else 1
    # Resample to fit width
    if len(data) > width:
        step = len(data) / width
        data = [data[int(i * step)] for i in range(width)]
    elif len(data) < width:
        data = data + [data[-1]] * (width - len(data))
    out = ""
    for v in data:
        idx = int(((v - mn) / rng) * (len(SPARK_CHARS) - 1))
        out += SPARK_CHARS[idx]
    return f"{C['C']}{out}{C['X']}"


def bar_gauge(value, max_val, width=30, label="", color="G"):
    """Horizontal bar gauge."""
    pct = min(value / max_val, 1.0) if max_val > 0 else 0
    filled = int(pct * width)
    empty = width - filled
    bar = f"{C[color]}{'█' * filled}{C['D']}{'░' * empty}{C['X']}"
    pct_str = f"{pct * 100:5.1f}%"
    if label:
        return f"  {label:>16s} {bar} {pct_str}"
    return f"  {bar} {pct_str}"


def progress_bar(current, total, width=40, label=""):
    """Progress bar with ETA feel."""
    pct = current / total if total > 0 else 0
    filled = int(pct * width)
    bar = "█" * filled + "▒" * (width - filled)
    return f"  {C['C']}{label}{C['X']} [{C['G']}{bar}{C['X']}] {current}/{total}"


# ── History chart (ASCII) ──────────────────────────────────────────

def ascii_chart(data, labels=None, height=10, width=60, title="", y_label=""):
    """
    Renders a full ASCII line chart.
    data: list of floats
    labels: optional x-axis labels (same length as data)
    """
    if not data or len(data) < 2:
        return ["  (insufficient data)"]

    lines = []
    if title:
        lines.append(f"  {C['BOLD']}{C['W']}{title}{C['X']}")
        lines.append("")

    mn, mx = min(data), max(data)
    rng = mx - mn if mx != mn else 1

    # Resample if needed
    if len(data) > width:
        step = len(data) / width
        sampled = [data[int(i * step)] for i in range(width)]
    else:
        sampled = data
        width = len(sampled)

    # Build grid
    grid = [[" " for _ in range(width)] for _ in range(height)]
    for col, val in enumerate(sampled):
        row = int(((val - mn) / rng) * (height - 1))
        row = height - 1 - row  # invert y
        grid[row][col] = f"{C['C']}●{C['X']}"
        # Fill below with dim dots
        for r in range(row + 1, height):
            if grid[r][col] == " ":
                grid[r][col] = f"{C['D']}·{C['X']}"

    # Y-axis labels
    y_top = f"{mx:>8.2f}"
    y_mid = f"{(mn + mx) / 2:>8.2f}"
    y_bot = f"{mn:>8.2f}"

    for i, row in enumerate(grid):
        if i == 0:
            y = y_top
        elif i == height // 2:
            y = y_mid
        elif i == height - 1:
            y = y_bot
        else:
            y = " " * 8
        lines.append(f"  {C['D']}{y}{C['X']} │{''.join(row)}│")

    # X-axis
    lines.append(f"  {' ' * 8} └{'─' * width}┘")

    if labels and len(labels) >= 2:
        first = str(labels[0])[:10]
        last = str(labels[-1])[:10]
        gap = width - len(first) - len(last)
        lines.append(f"  {' ' * 9}{C['D']}{first}{' ' * max(gap, 1)}{last}{C['X']}")

    return lines


# ── Status table ───────────────────────────────────────────────────

def status_table(rows, col_widths=None):
    """
    rows: list of tuples (label, value, status_color)
    status_color: 'G' green, 'Y' yellow, 'R' red
    """
    if not col_widths:
        col_widths = [24, 20, 10]
    for label, value, color in rows:
        indicator = f"{C[color]}●{C['X']}"
        print(f"  {indicator} {C['W']}{label:<{col_widths[0]}}{C['X']} "
              f"{C[color]}{str(value):<{col_widths[1]}}{C['X']}")


# ── Sequence log ───────────────────────────────────────────────────

class SequenceLog:
    """Tracks and displays a sequence of operations with timestamps."""

    def __init__(self):
        self.entries = []
        self.start_time = time.time()

    def step(self, msg, status="run"):
        icons = {"run": f"{C['C']}▸{C['X']}", "ok": f"{C['G']}✓{C['X']}",
                 "warn": f"{C['Y']}⚠{C['X']}", "fail": f"{C['R']}✗{C['X']}",
                 "info": f"{C['B']}ℹ{C['X']}"}
        elapsed = time.time() - self.start_time
        ts = f"{C['D']}[{elapsed:7.2f}s]{C['X']}"
        icon = icons.get(status, icons["info"])
        line = f"  {ts} {icon} {msg}"
        self.entries.append(line)
        print(line)

    def complete(self, msg):
        self.step(msg, "ok")

    def warn(self, msg):
        self.step(msg, "warn")

    def fail(self, msg):
        self.step(msg, "fail")

    def elapsed(self):
        return time.time() - self.start_time


# ── Timestamp ──────────────────────────────────────────────────────

def timestamp():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
