#!/usr/bin/env python3
"""
Valor Energy Partners — Zero-Setup Launcher
Clone → Run. Nothing else required.

Usage:
    python launcher/main.py [--env local|huggingface|docker] [--node-available true|false]
    # Or simply:
    ./run.sh
"""

import argparse
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

# Ensure launcher package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from launcher.display import (
    C, clear, ctext, hline, box_top, box_row, box_bot,
    bar_gauge, progress_bar, sparkline, ascii_chart,
    status_table, SequenceLog, timestamp,
)
from launcher.monitor import ResourceMonitor, ProcessTracker
from launcher.data_fetch import (
    fetch_feeds, fetch_prices,
    render_price_dashboard, render_feed_summary,
)

# ── Globals ────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
HF_PROXY = ROOT / "hf-proxy"
MONITOR = ResourceMonitor()
TRACKER = ProcessTracker()
LOG = SequenceLog()
ENV = "local"
NODE_AVAILABLE = False

# ── Graceful exit ──────────────────────────────────────────────────
def _shutdown(sig, frame):
    print(f"\n  {C['Y']}Shutting down...{C['X']}")
    MONITOR.stop()
    if os.name != "nt":
        try:
            os.killpg(os.getpgid(0), signal.SIGTERM)
        except Exception:
            pass
    sys.exit(0)

signal.signal(signal.SIGINT, _shutdown)
signal.signal(signal.SIGTERM, _shutdown)


# ══════════════════════════════════════════════════════════════════
#  BANNER
# ══════════════════════════════════════════════════════════════════

def banner():
    clear()
    print()
    print(f"{C['C']}{C['BOLD']}")
    print("  ██╗   ██╗ █████╗ ██╗      ██████╗ ██████╗ ")
    print("  ██║   ██║██╔══██╗██║     ██╔═══██╗██╔══██╗")
    print("  ██║   ██║███████║██║     ██║   ██║██████╔╝")
    print("  ╚██╗ ██╔╝██╔══██║██║     ██║   ██║██╔══██╗")
    print("   ╚████╔╝ ██║  ██║███████╗╚██████╔╝██║  ██║")
    print(f"    ╚═══╝  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝{C['X']}")
    print()
    print(f"  {C['W']}Strategic Intelligence Brief{C['X']}")
    print(f"  {C['D']}Effects-Based Analysis — Strait of Hormuz{C['X']}")
    print(f"  {C['D']}{timestamp()}{C['X']}")
    print()
    hline("═", "C")
    print()


# ══════════════════════════════════════════════════════════════════
#  MENU SYSTEM
# ══════════════════════════════════════════════════════════════════

MENU_ITEMS = [
    ("1", "Launch Full Stack",          "Start backend + frontend (local dev)"),
    ("2", "Launch Backend Only",        "FastAPI server on port 7860"),
    ("3", "Launch Frontend Only",       "Vite dev server on port 5173"),
    ("4", "Fetch Live Data",            "Pull feeds + prices, display analysis"),
    ("5", "Price Charts",               "ASCII commodity price history charts"),
    ("6", "System Resources",           "Live CPU/RAM/Disk/Net monitor"),
    ("7", "Deploy to HuggingFace",      "Build & push to HF Spaces"),
    ("8", "Build Production",           "npm build → dist/"),
    ("9", "Docker Build & Run",         "Build container, run locally"),
    ("0", "Quick Health Check",         "Verify all systems operational"),
    ("q", "Quit",                       ""),
]


def show_menu():
    box_top("COMMAND CENTER", )
    for key, label, desc in MENU_ITEMS:
        if key == "q":
            box_row(f"  {C['R']}{key}{C['X']}  {C['D']}{label}{C['X']}")
        else:
            box_row(f"  {C['C']}{key}{C['X']}  {C['W']}{label:<28}{C['X']} {C['D']}{desc}{C['X']}")
    box_bot()
    print()
    # Mini resource bar
    s = MONITOR.snapshot()
    cpu_c = "G" if s["cpu_pct"] < 60 else ("Y" if s["cpu_pct"] < 85 else "R")
    mem_c = "G" if s["mem_pct"] < 60 else ("Y" if s["mem_pct"] < 85 else "R")
    print(f"  {C['D']}Resources:{C['X']} "
          f"CPU {C[cpu_c]}{s['cpu_pct']:4.1f}%{C['X']} │ "
          f"RAM {C[mem_c]}{s['mem_used_gb']:.1f}/{s['mem_total_gb']:.1f}G{C['X']} │ "
          f"Disk {s['disk_used_gb']:.1f}/{s['disk_total_gb']:.1f}G │ "
          f"Env: {C['C']}{ENV}{C['X']}")
    print()


def prompt():
    try:
        return input(f"  {C['C']}valor ▸{C['X']} ").strip().lower()
    except EOFError:
        return "q"


# ══════════════════════════════════════════════════════════════════
#  ACTIONS
# ══════════════════════════════════════════════════════════════════

def action_full_stack():
    """Launch backend + frontend in parallel."""
    banner()
    box_top("FULL STACK LAUNCH")
    box_bot()
    print()
    log = SequenceLog()

    if not NODE_AVAILABLE:
        log.warn("Node.js not available — launching backend only")
        _launch_backend(log)
        return

    log.step("Installing npm dependencies...")
    success = _run_cmd(["npm", "install", "--prefer-offline"], cwd=ROOT, log=log, label="npm install")
    if not success:
        log.warn("npm install failed — aborting full stack launch.")
        return

    # Start backend
    log.step("Starting FastAPI backend on :7860...")
    be_cmd = [sys.executable, "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
    if ENV == "local":
        be_cmd.append("--reload")
    be_proc = _spawn(be_cmd, cwd=HF_PROXY, name="FastAPI Backend")
    log.complete(f"Backend PID {be_proc.pid}")

    # Start frontend
    log.step("Starting Vite dev server on :5173...")
    fe_proc = _spawn(
        ["npx", "vite", "--host"],
        cwd=ROOT, name="Vite Frontend"
    )
    log.complete(f"Frontend PID {fe_proc.pid}")

    print()
    hline("─", "G")
    print(f"  {C['G']}{C['BOLD']}Ready!{C['X']}")
    print(f"  {C['W']}Frontend:{C['X']}  {C['UL']}http://localhost:5173{C['X']}")
    print(f"  {C['W']}Backend:{C['X']}   {C['UL']}http://localhost:7860{C['X']}")
    print(f"  {C['W']}API Health:{C['X']} {C['UL']}http://localhost:7860/api/health{C['X']}")
    hline("─", "G")
    print()
    _wait_with_monitor(log)


def action_backend():
    banner()
    box_top("BACKEND LAUNCH")
    box_bot()
    print()
    log = SequenceLog()
    _launch_backend(log)


def _launch_backend(log):
    log.step("Checking backend dependencies...")
    ok = _run_cmd([sys.executable, "-m", "pip", "install", "-q", "-r",
                   str(HF_PROXY / "requirements.txt")],
                  cwd=HF_PROXY, log=log, label="pip install")
    if not ok:
        log.fail("Backend dependency installation failed — aborting backend launch.")
        return

    log.step("Starting FastAPI on :7860...")
    cmd = [sys.executable, "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
    if ENV == "local":
        cmd.append("--reload")
    proc = _spawn(cmd, cwd=HF_PROXY, name="FastAPI Backend")
    log.complete(f"Backend running — PID {proc.pid}")

    print()
    hline("─", "G")
    print(f"  {C['G']}{C['BOLD']}Backend Ready!{C['X']}")
    print(f"  {C['W']}API:{C['X']}    {C['UL']}http://localhost:7860{C['X']}")
    print(f"  {C['W']}Health:{C['X']} {C['UL']}http://localhost:7860/api/health{C['X']}")
    print(f"  {C['W']}Feeds:{C['X']}  {C['UL']}http://localhost:7860/api/feeds{C['X']}")
    print(f"  {C['W']}Prices:{C['X']} {C['UL']}http://localhost:7860/api/prices{C['X']}")
    hline("─", "G")
    print()
    _wait_with_monitor(log)


def action_frontend():
    if not NODE_AVAILABLE:
        print(f"  {C['R']}Node.js is required for the frontend.{C['X']}")
        _pause()
        return

    banner()
    box_top("FRONTEND LAUNCH")
    box_bot()
    print()
    log = SequenceLog()

    log.step("Installing npm dependencies...")
    _run_cmd(["npm", "install", "--prefer-offline"], cwd=ROOT, log=log, label="npm install")

    log.step("Starting Vite dev server on :5173...")
    proc = _spawn(["npx", "vite", "--host"], cwd=ROOT, name="Vite Frontend")
    log.complete(f"Frontend running — PID {proc.pid}")

    print()
    print(f"  {C['G']}{C['BOLD']}Frontend:{C['X']} {C['UL']}http://localhost:5173{C['X']}")
    print()
    _wait_with_monitor(log)


def action_fetch_data():
    banner()
    box_top("LIVE DATA FETCH")
    box_bot()
    print()
    log = SequenceLog()

    # Feeds
    log.step("Fetching RSS feeds from 9 sources...")
    items, feed_stats = fetch_feeds(log)

    # Prices
    log.step("Fetching commodity prices (Brent, WTI, OVX)...")
    prices = fetch_prices(log)

    # Display
    print()
    hline("═", "C")
    print(f"  {C['BOLD']}{C['W']}COMMODITY PRICES{C['X']}")
    render_price_dashboard(prices)

    print()
    hline("═", "C")
    print(f"  {C['BOLD']}{C['W']}LATEST INTELLIGENCE ({len(items)} articles){C['X']}")
    render_feed_summary(items, top_n=15)

    # Classification breakdown
    print()
    hline("─", "D")
    effects = sum(1 for i in items if i["classification"] == "EFFECT")
    events = sum(1 for i in items if i["classification"] == "EVENT")
    mixed = sum(1 for i in items if i["classification"] == "MIXED")
    total = len(items) or 1
    print(f"  {C['W']}Signal Classification:{C['X']}")
    print(bar_gauge(effects, total, 30, "EFFECT", "G"))
    print(bar_gauge(events, total, 30, "EVENT", "Y"))
    print(bar_gauge(mixed, total, 30, "MIXED", "D"))

    print()
    print(f"  {C['D']}Elapsed: {log.elapsed():.1f}s  │  "
          f"Sources: {feed_stats['live']}/{feed_stats['total']} live  │  "
          f"{timestamp()}{C['X']}")
    print()
    _pause()


def action_price_charts():
    banner()
    box_top("PRICE HISTORY CHARTS")
    box_bot()
    print()
    log = SequenceLog()

    # Select interval
    print(f"  {C['W']}Select history interval:{C['X']}")
    intervals = [("1", "1 Month", "1mo", "1d"),
                 ("2", "3 Months", "3mo", "1d"),
                 ("3", "6 Months", "6mo", "1wk"),
                 ("4", "1 Year", "1y", "1wk"),
                 ("5", "5 Years", "5y", "1mo")]
    for key, label, *_ in intervals:
        print(f"    {C['C']}{key}{C['X']}  {label}")
    print()
    choice = input(f"  {C['C']}interval ▸{C['X']} ").strip()

    # Default to 1mo
    selected = next((i for i in intervals if i[0] == choice), intervals[0])
    _, label, period, interval = selected

    log.step(f"Fetching {label} price history...")

    import math
    try:
        import yfinance as yf
    except ImportError:
        log.fail("yfinance not installed — run: pip install yfinance")
        _pause()
        return

    symbols = {"Brent Crude": "BZ=F", "WTI Crude": "CL=F", "Oil Volatility (OVX)": "^OVX"}
    for name, sym in symbols.items():
        try:
            hist = yf.Ticker(sym).history(period=period, interval=interval)
            if hist is not None and not hist.empty:
                data = []
                labels = []
                for dt, row in hist.iterrows():
                    close = row.get("Close")
                    if close is not None and not math.isnan(close):
                        data.append(float(close))
                        labels.append(str(dt.date()))
                if data:
                    lines = ascii_chart(data, labels=labels, height=12,
                                        width=min(55, len(data)),
                                        title=f"{name} — {label}")
                    for line in lines:
                        print(line)
                    print()
                    # Sparkline summary
                    chg = data[-1] - data[0]
                    chg_pct = (chg / data[0]) * 100 if data[0] else 0
                    color = "G" if chg >= 0 else "R"
                    print(f"  {C[color]}{'▲' if chg >= 0 else '▼'} "
                          f"${chg:+.2f} ({chg_pct:+.1f}%)  "
                          f"Range: ${min(data):.2f} – ${max(data):.2f}{C['X']}")
                    print()
        except Exception as e:
            log.warn(f"{name}: {e}")

    log.complete(f"Charts rendered — {label}")
    print()
    _pause()


def action_resources():
    """Live resource monitor with auto-refresh."""
    interval = "1m"

    while True:
        clear()
        print()
        print(f"  {C['BOLD']}{C['W']}SYSTEM RESOURCE MONITOR{C['X']}  "
              f"{C['D']}(interval: {interval} │ Ctrl+C → menu │ i → change interval){C['X']}")
        print()

        # Gauges
        MONITOR.render_gauges()
        print()

        # Sparklines
        hline("─", "D")
        print(f"  {C['D']}History ({interval}):{C['X']}")
        MONITOR.render_sparklines(interval)
        print()

        # Full CPU chart
        MONITOR.render_chart("cpu", interval, height=8, width=50)
        print()

        # Tracked processes
        hline("─", "D")
        print(f"  {C['D']}Tracked Processes:{C['X']}")
        TRACKER.render_status()
        print()
        print(f"  {C['D']}{timestamp()}  │  Press Enter to refresh, "
              f"i=interval, q=back{C['X']}")

        # Non-blocking input with timeout
        import select
        try:
            rlist, _, _ = select.select([sys.stdin], [], [], 3)
            if rlist:
                cmd = sys.stdin.readline().strip().lower()
                if cmd == "q":
                    return
                elif cmd == "i":
                    keys = list(ResourceMonitor.INTERVALS.keys())
                    idx = keys.index(interval) if interval in keys else 0
                    interval = keys[(idx + 1) % len(keys)]
        except (KeyboardInterrupt, EOFError):
            return


def action_deploy_hf():
    banner()
    box_top("HUGGINGFACE SPACES DEPLOY")
    box_bot()
    print()
    log = SequenceLog()

    if not NODE_AVAILABLE:
        log.warn("Node.js required for build step")
        _pause()
        return

    log.step("Building frontend (npm run build)...")
    ok = _run_cmd(["npm", "run", "build"], cwd=ROOT, log=log, label="npm build")
    if not ok:
        log.fail("Build failed — check errors above")
        _pause()
        return

    log.step("Verifying dist/ output...")
    dist = ROOT / "dist"
    if not dist.exists():
        log.fail("dist/ not found after build")
        _pause()
        return
    file_count = sum(1 for _ in dist.rglob("*") if _.is_file())
    log.complete(f"Build output: {file_count} files in dist/")

    log.step("Triggering HF sync workflow (if configured)...")

    # Verify current branch is main
    try:
        branch_result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=ROOT, capture_output=True, text=True, timeout=10
        )
        current_branch = branch_result.stdout.strip()
        if current_branch != "main":
            log.warn(f"Current branch is '{current_branch}', not 'main'.")
            print(f"  {C['Y']}Push to origin/main anyway? This may be unintentional. "
                  f"[y/N]: {C['X']}", end="", flush=True)
            confirm = input().strip().lower()
            if confirm != "y":
                log.step("Push cancelled.", "info")
                _pause()
                return
    except Exception as e:
        log.warn(f"Could not determine current branch: {e}")

    # Verify working tree is clean
    try:
        status_result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=ROOT, capture_output=True, text=True, timeout=10
        )
        if status_result.stdout.strip():
            log.warn("Working tree has uncommitted changes.")
            print(f"  {C['Y']}Push anyway (uncommitted changes will NOT be included)? "
                  f"[y/N]: {C['X']}", end="", flush=True)
            confirm = input().strip().lower()
            if confirm != "y":
                log.step("Push cancelled.", "info")
                _pause()
                return
    except Exception as e:
        log.warn(f"Could not check working tree status: {e}")

    # Final confirmation
    print(f"  {C['Y']}Push to origin/main to trigger HF deploy? [y/N]: {C['X']}",
          end="", flush=True)
    confirm = input().strip().lower()
    if confirm != "y":
        log.step("Push cancelled.", "info")
        _pause()
        return

    try:
        result = subprocess.run(
            ["git", "push", "origin", "main"],
            cwd=ROOT, capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            log.complete("Push to origin/main succeeded — HF sync workflow will trigger")
        else:
            log.warn(f"Push returned {result.returncode}: {result.stderr[:200]}")
            log.step("You can manually trigger: gh workflow run hf-sync.yml", "info")
    except Exception as e:
        log.warn(f"Push failed: {e}")
        log.step("Push to main manually, then HF sync workflow will deploy", "info")

    print()
    _pause()


def action_build():
    if not NODE_AVAILABLE:
        print(f"  {C['R']}Node.js is required for builds.{C['X']}")
        _pause()
        return

    banner()
    box_top("PRODUCTION BUILD")
    box_bot()
    print()
    log = SequenceLog()

    log.step("Installing dependencies...")
    _run_cmd(["npm", "install", "--prefer-offline"], cwd=ROOT, log=log, label="npm install")

    log.step("Building production bundle...")
    ok = _run_cmd(["npm", "run", "build"], cwd=ROOT, log=log, label="npm build")

    if ok:
        dist = ROOT / "dist"
        if dist.exists():
            files = list(dist.rglob("*"))
            total_size = sum(f.stat().st_size for f in files if f.is_file())
            log.complete(f"Build complete: {sum(1 for f in files if f.is_file())} files, "
                         f"{total_size / 1024:.0f} KB")
        else:
            log.warn("Build completed but dist/ not found")
    else:
        log.fail("Build failed")

    print()
    _pause()


def action_docker():
    banner()
    box_top("DOCKER BUILD & RUN")
    box_bot()
    print()
    log = SequenceLog()

    # Check docker
    try:
        subprocess.run(["docker", "--version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        log.fail("Docker not found. Install from https://docker.com")
        _pause()
        return

    image_name = "valor-intel"
    log.step(f"Building Docker image '{image_name}'...")
    ok = _run_cmd(
        ["docker", "build", "-t", image_name, "."],
        cwd=ROOT, log=log, label="docker build"
    )
    if not ok:
        log.fail("Docker build failed")
        _pause()
        return

    log.step("Starting container on :7860...")
    proc = _spawn(
        ["docker", "run", "--rm", "-p", "7860:7860", "--name", "valor-intel-run", image_name],
        cwd=ROOT, name="Docker Container"
    )
    log.complete(f"Container running — PID {proc.pid}")

    print()
    print(f"  {C['G']}{C['BOLD']}Dashboard:{C['X']} {C['UL']}http://localhost:7860{C['X']}")
    print()
    _wait_with_monitor(log)


def action_health():
    banner()
    box_top("SYSTEM HEALTH CHECK")
    box_bot()
    print()
    log = SequenceLog()
    checks = []

    # Python
    log.step("Python environment...")
    checks.append(("Python", f"{sys.version.split()[0]}", "G"))
    log.complete(f"Python {sys.version.split()[0]}")

    # Core packages
    for pkg_name, import_name in [("psutil", "psutil"), ("feedparser", "feedparser"),
                                   ("yfinance", "yfinance"), ("fastapi", "fastapi"),
                                   ("uvicorn", "uvicorn")]:
        try:
            mod = __import__(import_name)
            ver = getattr(mod, "__version__", "ok")
            checks.append((pkg_name, ver, "G"))
        except ImportError:
            checks.append((pkg_name, "missing", "R"))

    # Node
    if NODE_AVAILABLE:
        try:
            result = subprocess.run(["node", "--version"], capture_output=True, text=True)
            checks.append(("Node.js", result.stdout.strip(), "G"))
        except Exception:
            checks.append(("Node.js", "error", "R"))
    else:
        checks.append(("Node.js", "not found", "Y"))

    # npm
    try:
        result = subprocess.run(["npm", "--version"], capture_output=True, text=True)
        checks.append(("npm", result.stdout.strip(), "G"))
    except Exception:
        checks.append(("npm", "not found", "Y"))

    # Docker
    try:
        result = subprocess.run(["docker", "--version"], capture_output=True, text=True)
        ver = result.stdout.strip().split(",")[0].replace("Docker version", "").strip()
        checks.append(("Docker", ver, "G"))
    except Exception:
        checks.append(("Docker", "not found", "D"))

    # Git
    try:
        result = subprocess.run(["git", "--version"], capture_output=True, text=True)
        checks.append(("git", result.stdout.strip().split()[-1], "G"))
    except Exception:
        checks.append(("git", "not found", "Y"))

    # Disk space
    s = MONITOR.snapshot()
    disk_free = s["disk_total_gb"] - s["disk_used_gb"]
    disk_color = "G" if disk_free > 5 else ("Y" if disk_free > 1 else "R")
    checks.append(("Disk Free", f"{disk_free:.1f} GB", disk_color))

    # Network (try a quick fetch)
    log.step("Testing network connectivity...")
    try:
        import urllib.request
        urllib.request.urlopen("https://httpbin.org/get", timeout=5)
        checks.append(("Network", "connected", "G"))
        log.complete("Network OK")
    except Exception:
        checks.append(("Network", "no connection", "R"))
        log.warn("Network unreachable")

    # Project files
    log.step("Verifying project structure...")
    required = ["package.json", "vite.config.js", "src/App.jsx",
                 "hf-proxy/app.py", "hf-proxy/requirements.txt", "Dockerfile"]
    missing = [f for f in required if not (ROOT / f).exists()]
    if missing:
        checks.append(("Project Files", f"{len(missing)} missing", "R"))
        for m in missing:
            log.warn(f"Missing: {m}")
    else:
        checks.append(("Project Files", f"{len(required)}/{len(required)}", "G"))
        log.complete("All project files present")

    print()
    hline("═", "C")
    print(f"  {C['BOLD']}{C['W']}HEALTH SUMMARY{C['X']}")
    print()
    status_table(checks)

    ok_count = sum(1 for _, _, c in checks if c == "G")
    total = len(checks)
    print()
    if ok_count == total:
        print(f"  {C['G']}{C['BOLD']}All {total} checks passed.{C['X']}")
    else:
        print(f"  {C['Y']}{ok_count}/{total} checks passed.{C['X']}")

    print()
    print(f"  {C['D']}Elapsed: {log.elapsed():.1f}s  │  {timestamp()}{C['X']}")
    print()
    _pause()


# ══════════════════════════════════════════════════════════════════
#  UTILITIES
# ══════════════════════════════════════════════════════════════════

def _run_cmd(cmd, cwd, log, label="command"):
    """Run a command synchronously with output display."""
    try:
        result = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, timeout=300
        )
        if result.returncode == 0:
            log.complete(f"{label} succeeded")
            return True
        else:
            log.warn(f"{label} exited {result.returncode}")
            if result.stderr:
                for line in result.stderr.strip().split("\n")[:5]:
                    print(f"    {C['R']}{line}{C['X']}")
            return False
    except subprocess.TimeoutExpired:
        log.fail(f"{label} timed out (5min)")
        return False
    except FileNotFoundError:
        log.fail(f"{label}: command not found ({cmd[0]})")
        return False


def _spawn(cmd, cwd, name):
    """Spawn a background process and track it."""
    proc = subprocess.Popen(
        cmd, cwd=cwd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    TRACKER.track(proc.pid, name)
    return proc


def _wait_with_monitor(log):
    """Wait for user interrupt, showing live resource updates."""
    print(f"  {C['D']}Services running. Press Enter for menu, Ctrl+C to stop all.{C['X']}")
    print()

    try:
        if os.name == "nt":
            import msvcrt
            last_status = time.time()
            while True:
                if msvcrt.kbhit():
                    ch = msvcrt.getwch()
                    if ch in ("\r", "\n"):
                        return
                now = time.time()
                if now - last_status >= 5:
                    last_status = now
                    s = MONITOR.snapshot()
                    cpu_c = "G" if s["cpu_pct"] < 60 else ("Y" if s["cpu_pct"] < 85 else "R")
                    mem_c = "G" if s["mem_pct"] < 60 else ("Y" if s["mem_pct"] < 85 else "R")
                    print(
                        f"\r  {C['D']}[{log.elapsed():7.1f}s]{C['X']} "
                        f"CPU {C[cpu_c]}{s['cpu_pct']:4.1f}%{C['X']} │ "
                        f"RAM {C[mem_c]}{s['mem_pct']:4.1f}%{C['X']} │ "
                        f"Net ↓{s['net_rx_mbps']:.2f}MB/s  ",
                        end="",
                        flush=True,
                    )
                time.sleep(0.1)
        else:
            import select
            while True:
                rlist, _, _ = select.select([sys.stdin], [], [], 5)
                if rlist:
                    sys.stdin.readline()
                    return

                s = MONITOR.snapshot()
                cpu_c = "G" if s["cpu_pct"] < 60 else ("Y" if s["cpu_pct"] < 85 else "R")
                mem_c = "G" if s["mem_pct"] < 60 else ("Y" if s["mem_pct"] < 85 else "R")
                print(f"\r  {C['D']}[{log.elapsed():7.1f}s]{C['X']} "
                      f"CPU {C[cpu_c]}{s['cpu_pct']:4.1f}%{C['X']} │ "
                      f"RAM {C[mem_c]}{s['mem_pct']:4.1f}%{C['X']} │ "
                      f"Net ↓{s['net_rx_mbps']:.2f}MB/s  ",
                      end="", flush=True)
    except (KeyboardInterrupt, EOFError):
        print()
        return


def _pause():
    try:
        input(f"  {C['D']}Press Enter to continue...{C['X']}")
    except (EOFError, KeyboardInterrupt):
        pass


# ══════════════════════════════════════════════════════════════════
#  MAIN LOOP
# ══════════════════════════════════════════════════════════════════

ACTIONS = {
    "1": action_full_stack,
    "2": action_backend,
    "3": action_frontend,
    "4": action_fetch_data,
    "5": action_price_charts,
    "6": action_resources,
    "7": action_deploy_hf,
    "8": action_build,
    "9": action_docker,
    "0": action_health,
}


def main():
    global ENV, NODE_AVAILABLE

    parser = argparse.ArgumentParser(description="Valor Intelligence Launcher")
    parser.add_argument("--env", default="local", choices=["local", "huggingface", "docker"])
    parser.add_argument("--node-available", default="false")
    parser.add_argument("--auto", help="Auto-run action number and exit")
    args = parser.parse_args()

    ENV = args.env
    NODE_AVAILABLE = args.node_available.lower() == "true"

    # Start resource monitor
    MONITOR.start()
    time.sleep(0.5)  # let it collect initial sample

    # Auto mode (for CI/CD or HF Spaces)
    if args.auto:
        action = ACTIONS.get(args.auto)
        if action:
            action()
        return

    # HuggingFace auto-start
    if ENV == "huggingface":
        print(f"  {C['C']}HuggingFace Space detected — auto-starting backend...{C['X']}")
        action_backend()
        return

    # Interactive menu loop
    while True:
        banner()
        show_menu()
        choice = prompt()

        if choice in ("q", "quit", "exit"):
            MONITOR.stop()
            print(f"\n  {C['D']}Goodbye.{C['X']}\n")
            sys.exit(0)

        action = ACTIONS.get(choice)
        if action:
            try:
                action()
            except KeyboardInterrupt:
                print()
                continue
        else:
            print(f"  {C['Y']}Invalid selection.{C['X']}")
            time.sleep(0.8)


if __name__ == "__main__":
    main()
