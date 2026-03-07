"""
Resource monitor — live system metrics with history tracking and graphical display.
"""

import time
import threading
from collections import deque

import psutil

from launcher.display import (
    C, bar_gauge, sparkline, ascii_chart, status_table,
)


class ResourceMonitor:
    """
    Continuously samples CPU, memory, disk, and network metrics.
    Maintains rolling history for charting at user-selected intervals.
    """

    # History intervals (seconds between samples for each window)
    INTERVALS = {
        "1m":  {"window": 60,   "sample_rate": 1},
        "5m":  {"window": 300,  "sample_rate": 5},
        "15m": {"window": 900,  "sample_rate": 15},
        "1h":  {"window": 3600, "sample_rate": 60},
    }

    def __init__(self):
        self.cpu_history = {k: deque(maxlen=60) for k in self.INTERVALS}
        self.mem_history = {k: deque(maxlen=60) for k in self.INTERVALS}
        self.net_rx_history = {k: deque(maxlen=60) for k in self.INTERVALS}
        self.net_tx_history = {k: deque(maxlen=60) for k in self.INTERVALS}
        self._lock = threading.Lock()
        self._running = False
        self._thread = None
        self._last_sample = {k: 0 for k in self.INTERVALS}
        self._last_net = None

        # Snapshot
        self.cpu_pct = 0.0
        self.cpu_count = psutil.cpu_count() or 1
        self.mem_total = 0
        self.mem_used = 0
        self.mem_pct = 0.0
        self.disk_total = 0
        self.disk_used = 0
        self.disk_pct = 0.0
        self.net_rx_rate = 0.0  # bytes/s
        self.net_tx_rate = 0.0
        self.process_count = 0

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._sample_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False

    def _sample_loop(self):
        while self._running:
            self._sample()
            time.sleep(1)

    def _sample(self):
        now = time.time()

        # CPU
        self.cpu_pct = psutil.cpu_percent(interval=0)

        # Memory
        mem = psutil.virtual_memory()
        self.mem_total = mem.total
        self.mem_used = mem.used
        self.mem_pct = mem.percent

        # Disk
        try:
            disk = psutil.disk_usage("/")
            self.disk_total = disk.total
            self.disk_used = disk.used
            self.disk_pct = disk.percent
        except Exception:
            pass

        # Network
        try:
            net = psutil.net_io_counters()
            if self._last_net:
                dt = max(now - self._last_net[2], 0.1)
                self.net_rx_rate = (net.bytes_recv - self._last_net[0]) / dt
                self.net_tx_rate = (net.bytes_sent - self._last_net[1]) / dt
            self._last_net = (net.bytes_recv, net.bytes_sent, now)
        except Exception:
            pass

        # Process count
        try:
            self.process_count = len(psutil.pids())
        except Exception:
            pass

        # Record history at each interval
        with self._lock:
            for interval, cfg in self.INTERVALS.items():
                if now - self._last_sample[interval] >= cfg["sample_rate"]:
                    self._last_sample[interval] = now
                    self.cpu_history[interval].append(self.cpu_pct)
                    self.mem_history[interval].append(self.mem_pct)
                    self.net_rx_history[interval].append(self.net_rx_rate)
                    self.net_tx_history[interval].append(self.net_tx_rate)

    def snapshot(self):
        """Return current metrics as a dict."""
        return {
            "cpu_pct": self.cpu_pct,
            "cpu_count": self.cpu_count,
            "mem_total_gb": self.mem_total / (1024 ** 3),
            "mem_used_gb": self.mem_used / (1024 ** 3),
            "mem_pct": self.mem_pct,
            "disk_total_gb": self.disk_total / (1024 ** 3),
            "disk_used_gb": self.disk_used / (1024 ** 3),
            "disk_pct": self.disk_pct,
            "net_rx_mbps": self.net_rx_rate / (1024 * 1024),
            "net_tx_mbps": self.net_tx_rate / (1024 * 1024),
            "process_count": self.process_count,
        }

    # ── Display methods ────────────────────────────────────────────

    def render_gauges(self):
        """Print live resource gauges."""
        s = self.snapshot()
        print(bar_gauge(s["cpu_pct"], 100, 30, "CPU", self._color(s["cpu_pct"])))
        print(bar_gauge(s["mem_pct"], 100, 30,
                        f"RAM {s['mem_used_gb']:.1f}/{s['mem_total_gb']:.1f}G",
                        self._color(s["mem_pct"])))
        print(bar_gauge(s["disk_pct"], 100, 30,
                        f"Disk {s['disk_used_gb']:.1f}/{s['disk_total_gb']:.1f}G",
                        self._color(s["disk_pct"])))
        net_label = f"Net ↓{s['net_rx_mbps']:.2f} ↑{s['net_tx_mbps']:.2f} MB/s"
        print(f"  {net_label:>16s} {C['D']}│{C['X']} "
              f"{C['C']}Cores: {s['cpu_count']}{C['X']}  "
              f"{C['D']}Procs: {s['process_count']}{C['X']}")

    def render_sparklines(self, interval="1m"):
        """Print sparkline history for given interval."""
        with self._lock:
            cpu_data = list(self.cpu_history.get(interval, []))
            mem_data = list(self.mem_history.get(interval, []))
            rx_data = list(self.net_rx_history.get(interval, []))

        print(f"  {C['D']}CPU  {C['X']}{sparkline(cpu_data, 50)}")
        print(f"  {C['D']}RAM  {C['X']}{sparkline(mem_data, 50)}")
        print(f"  {C['D']}Net↓ {C['X']}{sparkline(rx_data, 50)}")

    def render_chart(self, metric="cpu", interval="5m", height=10, width=50):
        """Print a full ASCII chart of a metric over a history interval."""
        with self._lock:
            history_map = {
                "cpu": self.cpu_history,
                "mem": self.mem_history,
                "net_rx": self.net_rx_history,
                "net_tx": self.net_tx_history,
            }
            data = list(history_map.get(metric, {}).get(interval, []))

        title_map = {"cpu": "CPU %", "mem": "Memory %",
                     "net_rx": "Network RX (bytes/s)", "net_tx": "Network TX (bytes/s)"}
        title = f"{title_map.get(metric, metric)} — last {interval}"
        lines = ascii_chart(data, height=height, width=width, title=title)
        for line in lines:
            print(line)

    @staticmethod
    def _color(pct):
        if pct < 60:
            return "G"
        elif pct < 85:
            return "Y"
        return "R"


# ── Process tracker ────────────────────────────────────────────────

class ProcessTracker:
    """Track spawned child processes and their resource usage."""

    def __init__(self):
        self.tracked = {}  # pid -> {name, started, ...}

    def track(self, pid, name):
        self.tracked[pid] = {"name": name, "started": time.time()}

    def untrack(self, pid):
        self.tracked.pop(pid, None)

    def render_status(self):
        """Print status of all tracked processes."""
        if not self.tracked:
            print(f"  {C['D']}No active processes{C['X']}")
            return

        rows = []
        for pid, info in list(self.tracked.items()):
            try:
                p = psutil.Process(pid)
                cpu = p.cpu_percent(interval=0)
                mem = p.memory_info().rss / (1024 * 1024)
                elapsed = time.time() - info["started"]
                color = "G" if p.is_running() else "R"
                rows.append((
                    f"PID {pid} — {info['name']}",
                    f"CPU {cpu:.0f}% | RAM {mem:.0f}MB | {elapsed:.0f}s",
                    color
                ))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                rows.append((f"PID {pid} — {info['name']}", "exited", "D"))
                self.tracked.pop(pid, None)

        status_table(rows)
