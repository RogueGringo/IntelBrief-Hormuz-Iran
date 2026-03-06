"""
Motion Intelligence — FastAPI middle layer.

Serves the dashboard frontend at / and motion analysis API at /api/*.
Connects sovereign-lib (IMU processing, topology, classification) with
a dual-model LLM manager for real-time coaching and batch distillation.

  /           — The intelligence dashboard (React SPA)
  /api/ingest — Upload swing CSV for processing
  /api/signals— Motion quality signal inventory
  /api/health — Service status
"""

import json
import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import asyncio

from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from llm_manager import LLMManager
from swing_store import SwingRecord, SwingStore

# ─── LOGGING ─────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s %(message)s',
)
logger = logging.getLogger("sovereign")

# ─── APP SETUP ────────────────────────────────────────────────
_start_time = time.time()

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

app = FastAPI(
    title="Sovereign Motion API",
    version="1.0.0",
    description="Topological motion intelligence — capture, encode, and analyze motion patterns from STEVAL-PROTEUS1 IMU sensor.",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── REQUEST LOGGING ──────────────────────────────────────────
from starlette.middleware.base import BaseHTTPMiddleware

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.time()
        response = await call_next(request)
        elapsed = (time.time() - start) * 1000
        if request.url.path.startswith("/api/"):
            logger.info("%s %s %d %.0fms", request.method, request.url.path, response.status_code, elapsed)
        return response

app.add_middleware(RequestLoggingMiddleware)

# ─── OPTIONAL API KEY AUTH ─────────────────────────────────────
API_KEY = os.environ.get("SOVEREIGN_API_KEY")
if API_KEY:
    from starlette.middleware.base import BaseHTTPMiddleware

    class APIKeyMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            # Skip auth for static files, health, docs
            path = request.url.path
            if path in ("/", "/api/health", "/api/version", "/api/docs", "/api/redoc", "/openapi.json") or not path.startswith("/api/"):
                return await call_next(request)
            key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
            if key != API_KEY:
                return JSONResponse({"error": "Invalid or missing API key"}, status_code=401)
            return await call_next(request)

    app.add_middleware(APIKeyMiddleware)


# ─── PATHS ────────────────────────────────────────────────────
STATIC_DIR = Path(__file__).parent / "static"
SOVEREIGN_LIB = Path(os.environ.get("SOVEREIGN_LIB_PATH", Path(__file__).parent.parent / "sovereign-lib"))
DATA_DIR = Path(os.environ.get("SOVEREIGN_DATA_DIR", Path(__file__).parent / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
BASELINE_DIR = DATA_DIR / "baselines"

SETTINGS_FILE = DATA_DIR / "settings.json"

# Create data directories on startup
for d in [DATA_DIR, UPLOAD_DIR, BASELINE_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ─── SINGLETONS ───────────────────────────────────────────────
store = SwingStore(str(DATA_DIR / "swings"))
llm = LLMManager()

from classifier import MotionClassifier

motion_classifier = MotionClassifier(str(DATA_DIR / "classifiers"))
motion_classifier.load()

# ─── SOVEREIGN-LIB IMPORTS (graceful) ────────────────────────
IMUTimeSeries = None
extract_imu_features = None
PhaseDetector = None
encode_motion = None
sovereign_lib_available = False

try:
    sys.path.insert(0, str(SOVEREIGN_LIB))
    from sovereign_motion.imu import IMUTimeSeries
    from sovereign_motion.features import extract_imu_features
    from sovereign_motion.phase_detect import PhaseDetector
    from sovereign_topo.encode import encode_motion
    from sovereign_motion.quality import analyze_quality
    sovereign_lib_available = True
except ImportError as e:
    logger.warning("sovereign-lib not available: %s", e)

# ─── 20 MOTION QUALITY SIGNALS ───────────────────────────────
SIGNALS = [
    # IMU signals
    {"id": "sample_rate", "label": "Sample Rate", "category": "imu", "unit": "Hz", "value": 0, "status": "unknown"},
    {"id": "axis_saturation", "label": "Axis Saturation", "category": "imu", "unit": "%", "value": 0, "status": "unknown"},
    {"id": "noise_floor", "label": "Noise Floor", "category": "imu", "unit": "mg", "value": 0, "status": "unknown"},
    {"id": "drift", "label": "Gyro Drift", "category": "imu", "unit": "deg/s", "value": 0, "status": "unknown"},
    # Feature signals
    {"id": "feature_completeness", "label": "Feature Completeness", "category": "features", "unit": "%", "value": 0, "status": "unknown"},
    {"id": "phase_confidence", "label": "Phase Confidence", "category": "features", "unit": "%", "value": 0, "status": "unknown"},
    {"id": "kinematic_integrity", "label": "Kinematic Integrity", "category": "features", "unit": "%", "value": 0, "status": "unknown"},
    {"id": "impact_detection", "label": "Impact Detection", "category": "features", "unit": "bool", "value": 0, "status": "unknown"},
    # Topology signals
    {"id": "h0_status", "label": "H0 Components", "category": "topology", "unit": "count", "value": 0, "status": "unknown"},
    {"id": "h1_status", "label": "H1 Loops", "category": "topology", "unit": "count", "value": 0, "status": "unknown"},
    {"id": "persistence_lifetime", "label": "Persistence Lifetime", "category": "topology", "unit": "ms", "value": 0, "status": "unknown"},
    {"id": "sheaf_coherence", "label": "Sheaf Coherence", "category": "topology", "unit": "%", "value": 0, "status": "unknown"},
    # LLM signals
    {"id": "gpu_model_status", "label": "GPU Model Status", "category": "llm", "unit": "status", "value": 0, "status": "offline"},
    {"id": "cpu_model_status", "label": "CPU Model Status", "category": "llm", "unit": "status", "value": 0, "status": "offline"},
    {"id": "gpu_vram", "label": "GPU VRAM Used", "category": "llm", "unit": "MB", "value": 0, "status": "unknown"},
    {"id": "inference_latency", "label": "Inference Latency", "category": "llm", "unit": "ms", "value": 0, "status": "unknown"},
    # Data signals
    {"id": "swings_ingested", "label": "Swings Ingested", "category": "data", "unit": "count", "value": 0, "status": "unknown"},
    {"id": "ground_truth_coverage", "label": "Ground Truth Coverage", "category": "data", "unit": "%", "value": 0, "status": "unknown"},
    {"id": "baseline_count", "label": "Baseline Count", "category": "data", "unit": "count", "value": 0, "status": "unknown"},
    {"id": "unprocessed_queue", "label": "Unprocessed Queue", "category": "data", "unit": "count", "value": 0, "status": "unknown"},
]

CATEGORY_META = {
    "imu": {"label": "IMU Sensors", "icon": "activity", "color": "#3b82f6"},
    "features": {"label": "Feature Extraction", "icon": "cpu", "color": "#10b981"},
    "topology": {"label": "Topological Analysis", "icon": "git-branch", "color": "#8b5cf6"},
    "llm": {"label": "LLM Models", "icon": "brain", "color": "#f59e0b"},
    "data": {"label": "Data Inventory", "icon": "database", "color": "#ef4444"},
}

# ─── CLASSIFICATION ──────────────────────────────────────────
CLEAN_KEYWORDS = [
    "smooth", "consistent", "balanced", "stable", "fluid",
    "controlled", "rhythmic", "efficient", "powerful", "clean",
    "on-plane", "square", "lag", "release", "tempo",
    "weight shift", "hip rotation", "shoulder turn", "follow through",
    "impact", "compression", "acceleration", "deceleration",
]

NOISY_KEYWORDS = [
    "erratic", "inconsistent", "jerky", "unstable", "choppy",
    "over-the-top", "casting", "sway", "slide", "reverse pivot",
    "early extension", "chicken wing", "flip", "scoop", "decel",
    "loss of posture", "hanging back", "lunging", "steep", "flat",
]


def classify_text(text: str) -> dict[str, Any]:
    """Classify swing description as clean or noisy."""
    if not text:
        return {"classification": "unknown", "confidence": 0.0, "clean_hits": [], "noisy_hits": []}
    lower = text.lower()
    clean_hits = [k for k in CLEAN_KEYWORDS if k in lower]
    noisy_hits = [k for k in NOISY_KEYWORDS if k in lower]
    total = len(clean_hits) + len(noisy_hits)
    if total == 0:
        return {"classification": "unknown", "confidence": 0.0, "clean_hits": [], "noisy_hits": []}
    score = (len(clean_hits) - len(noisy_hits)) / total
    classification = "clean" if score > 0.15 else ("noisy" if score < -0.15 else "mixed")
    confidence = min(1.0, total / 6.0)
    return {
        "classification": classification,
        "confidence": round(confidence, 3),
        "clean_hits": clean_hits,
        "noisy_hits": noisy_hits,
    }


# ─── SOVEREIGN CLI HELPER ────────────────────────────────────
def run_sovereign_cli(*args: str) -> dict[str, Any]:
    """Run sovereign-lib CLI as a subprocess (cold path)."""
    cli_path = SOVEREIGN_LIB / "sovereign_cli" / "main.py"
    if not cli_path.exists():
        return {"error": "sovereign-cli not found", "path": str(cli_path)}
    try:
        result = subprocess.run(
            [sys.executable, str(cli_path), *args],
            capture_output=True, text=True, timeout=60,
            cwd=str(SOVEREIGN_LIB),
        )
        if result.returncode != 0:
            return {"error": result.stderr.strip() or "CLI failed", "returncode": result.returncode}
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return {"output": result.stdout.strip()}
    except subprocess.TimeoutExpired:
        return {"error": "CLI timeout (60s)"}
    except Exception as e:
        return {"error": str(e)}


# ─── HEALTH ───────────────────────────────────────────────────
@app.get("/api/version")
async def version():
    """System version and capability info."""
    return {
        "version": "1.0.0",
        "api_version": "v1",
        "sovereign_lib": sovereign_lib_available,
        "capabilities": {
            "feature_extraction": extract_imu_features is not None,
            "topology_encoding": encode_motion is not None,
            "phase_detection": PhaseDetector is not None,
            "llm_coaching": llm.gpu_slot is not None or llm.cpu_slot is not None,
            "live_sensor": True,
            "anomaly_detection": True,
            "batch_processing": True,
        },
        "python_version": sys.version.split()[0],
    }


@app.get("/api/health")
async def health():
    all_swings = store.list_all()
    analyzed = sum(1 for s in all_swings if s.get("status") == "analyzed")
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sovereign_lib": sovereign_lib_available,
        "llm_gpu": llm.gpu_slot is not None,
        "llm_cpu": llm.cpu_slot is not None,
        "swings": len(all_swings),
        "analyzed": analyzed,
        "uptime_s": round(time.time() - _start_time, 1),
    }


# ─── SENSOR STATUS ───────────────────────────────────────────
def _get_sensor_status():
    """Query connected Sovereign Sensor via USB serial (sync helper)."""
    try:
        import serial
        import serial.tools.list_ports

        port_name = None
        for port in serial.tools.list_ports.comports():
            hwid = (port.hwid or "").upper()
            if "0483:5740" in hwid:
                port_name = port.device
                break

        if not port_name:
            return {"connected": False, "error": "Sensor not found"}

        ser = serial.Serial(port_name, 115200, timeout=2, dsrdtr=True)
        ser.dtr = True
        import time as _time
        _time.sleep(0.5)
        ser.reset_input_buffer()

        ser.write(b"GET STATUS\n")
        _time.sleep(1.0)
        resp = ser.read(ser.in_waiting or 512).decode("utf-8", errors="replace").strip()
        ser.close()

        for line in resp.split("\n"):
            line = line.strip()
            if line.startswith("STATUS "):
                resp = line
                break

        if not resp.startswith("STATUS"):
            return {"connected": True, "port": port_name, "raw": resp}

        status = {"connected": True, "port": port_name}
        for part in resp.replace("STATUS ", "").split():
            if "=" in part:
                k, v = part.split("=", 1)
                status[k] = v

        return status

    except Exception as e:
        return {"connected": False, "error": str(e)}


@app.get("/api/sensor/status")
async def sensor_status():
    """Query connected Sovereign Sensor via USB serial."""
    return _get_sensor_status()


@app.post("/api/sensor/command")
async def sensor_command(request: Request):
    """Send a command to the Sovereign Sensor."""
    body = await request.json()
    cmd = body.get("command", "").strip()

    if not cmd:
        return JSONResponse({"error": "No command provided"}, status_code=400)

    # Whitelist allowed commands
    allowed = ["GET STATUS", "GET VERSION"]
    allowed_prefixes = ["SET THRESHOLD ", "SET DURATION ", "SET COOLDOWN "]
    if cmd not in allowed and not any(cmd.startswith(p) for p in allowed_prefixes):
        return JSONResponse({"error": f"Command not allowed: {cmd}"}, status_code=403)

    try:
        import serial
        import serial.tools.list_ports

        port_name = None
        for port in serial.tools.list_ports.comports():
            hwid = (port.hwid or "").upper()
            if "0483:5740" in hwid:
                port_name = port.device
                break

        if not port_name:
            return JSONResponse({"error": "Sensor not found"}, status_code=503)

        ser = serial.Serial(port_name, 115200, timeout=2, dsrdtr=True)
        ser.dtr = True
        import time as _time
        _time.sleep(0.5)
        ser.reset_input_buffer()

        ser.write(f"{cmd}\n".encode())
        _time.sleep(1.0)
        raw = ser.read(ser.in_waiting or 512).decode("utf-8", errors="replace").strip()
        ser.close()

        # Extract the command response (skip session data)
        resp = raw
        for line in raw.split("\n"):
            line = line.strip()
            if line.startswith("OK ") or line.startswith("ERR ") or line.startswith("STATUS ") or line.startswith("VERSION "):
                resp = line
                break

        return {"command": cmd, "response": resp}

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ─── CAPTURE DAEMON CONTROL ──────────────────────────────────
_capture_process = None

@app.post("/api/sensor/capture/start")
async def start_capture():
    """Start the capture daemon as a subprocess."""
    global _capture_process
    if _capture_process and _capture_process.poll() is None:
        return {"status": "already_running", "pid": _capture_process.pid}

    daemon_path = Path(__file__).parent.parent / "FW_DEV" / "Proteus1" / "sovereign-sensor" / "tools" / "capture_daemon.py"
    if not daemon_path.exists():
        return JSONResponse({"error": "Capture daemon not found"}, status_code=404)

    _capture_process = subprocess.Popen(
        [sys.executable, str(daemon_path), "--api", "http://localhost:8000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    return {"status": "started", "pid": _capture_process.pid}


@app.post("/api/sensor/capture/stop")
async def stop_capture():
    """Stop the capture daemon."""
    global _capture_process
    if not _capture_process or _capture_process.poll() is not None:
        return {"status": "not_running"}

    _capture_process.terminate()
    try:
        _capture_process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _capture_process.kill()

    pid = _capture_process.pid
    _capture_process = None
    return {"status": "stopped", "pid": pid}


@app.get("/api/sensor/capture/status")
async def capture_status():
    """Check capture daemon status."""
    if _capture_process and _capture_process.poll() is None:
        return {"running": True, "pid": _capture_process.pid}
    return {"running": False}


# ─── LIVE STREAM ─────────────────────────────────────────────
@app.get("/api/sensor/stream")
async def sensor_stream():
    """Server-Sent Events stream of live IMU data from sensor."""

    async def event_generator():
        import serial
        import serial.tools.list_ports

        port_name = None
        for port in serial.tools.list_ports.comports():
            hwid = (port.hwid or "").upper()
            if "0483:5740" in hwid:
                port_name = port.device
                break

        if not port_name:
            yield f"data: {json.dumps({'error': 'Sensor not found'})}\n\n"
            return

        try:
            ser = serial.Serial(port_name, 115200, timeout=0.1, dsrdtr=True)
            ser.dtr = True
            await asyncio.sleep(0.5)
            ser.reset_input_buffer()

            yield f"data: {json.dumps({'event': 'connected', 'port': port_name})}\n\n"

            buf = ""
            header = None
            sample_count = 0

            while True:
                if ser.in_waiting > 0:
                    chunk = ser.read(ser.in_waiting).decode("utf-8", errors="replace")
                    buf += chunk

                    while "\n" in buf:
                        line, buf = buf.split("\n", 1)
                        line = line.strip()
                        if not line:
                            continue

                        if line.startswith("#"):
                            yield f"data: {json.dumps({'event': 'meta', 'line': line})}\n\n"
                            continue

                        if header is None:
                            header = [c.strip() for c in line.split(",")]
                            yield f"data: {json.dumps({'event': 'header', 'columns': header})}\n\n"
                            continue

                        # Parse data row
                        cols = line.split(",")
                        row = {}
                        for i, col_name in enumerate(header):
                            if i < len(cols):
                                try:
                                    row[col_name] = float(cols[i])
                                except ValueError:
                                    row[col_name] = cols[i].strip()
                        sample_count += 1
                        row["_n"] = sample_count
                        yield f"data: {json.dumps({'event': 'sample', 'd': row})}\n\n"
                else:
                    await asyncio.sleep(0.01)

        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"
        finally:
            try:
                ser.close()
            except Exception:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ─── INGEST ──────────────────────────────────────────────────
@app.post("/api/ingest")
@limiter.limit("10/minute")
async def ingest(request: Request, file: UploadFile = File(...), ground_truth: str = Form("{}"), auto_analyze: bool = Form(True)):
    # Limit upload size to 50MB
    contents = await file.read()
    if len(contents) > 50 * 1024 * 1024:
        return JSONResponse({"error": "File too large (max 50MB)"}, status_code=413)
    await file.seek(0)

    swing_id = store.create_id()
    save_path = UPLOAD_DIR / f"{swing_id}_{file.filename}"
    content = await file.read()

    # ── CSV validation ──
    EXPECTED_COLUMNS = {
        "timestamp_us", "accel_x_mg", "accel_y_mg", "accel_z_mg",
        "gyro_x_mdps", "gyro_y_mdps", "gyro_z_mdps",
    }
    try:
        text = content.decode("utf-8-sig")  # Handle BOM from Windows tools
    except UnicodeDecodeError:
        return JSONResponse(
            {"error": "File is not valid UTF-8 text"},
            status_code=400,
        )

    # Find the first non-comment line as the header
    header_line = None
    for line in text.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            header_line = stripped
            break

    if header_line is None:
        return JSONResponse(
            {"error": "CSV file contains no data rows"},
            status_code=400,
        )

    csv_columns = {col.strip() for col in header_line.split(",")}
    missing = EXPECTED_COLUMNS - csv_columns
    if missing:
        return JSONResponse(
            {
                "error": f"CSV missing required columns: {sorted(missing)}",
                "expected": sorted(EXPECTED_COLUMNS),
                "found": sorted(csv_columns),
            },
            status_code=400,
        )

    # ── Parse header/footer comment metadata ──
    session_meta: dict[str, Any] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# device=") or stripped.startswith("#device="):
            # Header: # device=PROTEUS1,rate=500,session=0001,mode=threshold
            parts = stripped.lstrip("# ").split(",")
            for part in parts:
                if "=" in part:
                    k, v = part.split("=", 1)
                    session_meta[k.strip()] = v.strip()
        elif stripped.startswith("# end ") or stripped.startswith("#end "):
            # Footer: # end session=0001,samples=1359,duration=1.63
            after_end = stripped.split("end", 1)[1].strip()
            parts = after_end.split(",")
            for part in parts:
                if "=" in part:
                    k, v = part.split("=", 1)
                    session_meta[k.strip()] = v.strip()

    save_path.write_bytes(content)

    try:
        gt = json.loads(ground_truth)
    except json.JSONDecodeError:
        gt = {}

    record = SwingRecord(
        id=swing_id,
        filename=file.filename or "unknown.csv",
        ground_truth=gt,
        status="ingested",
        session_meta=session_meta if session_meta else None,
    )
    store.save(record)

    # Quick-look data summary
    data_lines = [l for l in text.splitlines() if l.strip() and not l.strip().startswith("#")]
    n_rows = max(0, len(data_lines) - 1)  # exclude header
    preview = {}
    if n_rows > 0:
        import csv as csv_mod
        import io
        reader = csv_mod.DictReader(io.StringIO("\n".join(data_lines)))
        vals = {"accel_x_mg": [], "accel_y_mg": [], "accel_z_mg": []}
        for row in reader:
            for k in vals:
                try:
                    vals[k].append(float(row.get(k, 0)))
                except (ValueError, TypeError):
                    pass
        if vals["accel_x_mg"]:
            preview["samples"] = n_rows
            preview["duration_est_s"] = round(n_rows / 500, 2)  # assumes 500Hz
            magnitudes = [(x**2 + y**2 + z**2)**0.5 for x, y, z in zip(vals["accel_x_mg"], vals["accel_y_mg"], vals["accel_z_mg"])]
            preview["peak_accel_mg"] = round(max(magnitudes), 1)
            preview["mean_accel_mg"] = round(sum(magnitudes) / len(magnitudes), 1)

    logger.info("ingest filename=%s samples=%d size=%d", file.filename, n_rows, len(content))

    result = {
        "id": swing_id,
        "filename": file.filename,
        "status": "ingested",
        "size": len(content),
        "session_meta": session_meta if session_meta else None,
        "preview": preview if preview else None,
    }

    # Auto-analyze if sovereign-lib is available
    if auto_analyze and sovereign_lib_available:
        try:
            analysis = await _analyze_swing(swing_id)
            result["status"] = "analyzed"
            result["analysis"] = analysis
        except Exception as e:
            result["auto_analyze_error"] = str(e)

    return result


# ─── FEATURE EXTRACTION ──────────────────────────────────────
@app.post("/api/features/{swing_id}")
async def extract_features(swing_id: str):
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)

    if extract_imu_features is not None:
        upload_path = list(UPLOAD_DIR.glob(f"{swing_id}_*"))
        if upload_path:
            try:
                ts = IMUTimeSeries.from_csv(str(upload_path[0]))
                features = extract_imu_features(ts)
                store.update(swing_id, features=features, status="features_extracted")
                return {"id": swing_id, "features": features, "status": "features_extracted"}
            except Exception as e:
                return JSONResponse({"error": str(e)}, status_code=500)

    # Fallback: run via CLI
    result = run_sovereign_cli("features", "--swing", swing_id)
    if "error" not in result:
        store.update(swing_id, features=result.get("features", {}), status="features_extracted")
    return {"id": swing_id, **result}


# ─── TOPOLOGY ENCODING ───────────────────────────────────────
@app.post("/api/encode/{swing_id}")
async def encode(swing_id: str):
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)

    if encode_motion is not None:
        upload_path = list(UPLOAD_DIR.glob(f"{swing_id}_*"))
        if upload_path:
            try:
                ts = IMUTimeSeries.from_csv(str(upload_path[0]))
                topology = encode_motion(ts)
                # Add phase detection if available
                if PhaseDetector is not None:
                    detector = PhaseDetector()
                    phase_result = detector.detect(ts)
                    topology["phases"] = phase_result
                store.update(swing_id, topology=topology, status="encoded")
                return {"id": swing_id, "topology": topology, "status": "encoded"}
            except Exception as e:
                return JSONResponse({"error": str(e)}, status_code=500)

    result = run_sovereign_cli("encode", "--swing", swing_id)
    if "error" not in result:
        store.update(swing_id, topology=result.get("topology", {}), status="encoded")
    return {"id": swing_id, **result}


# ─── CLASSIFICATION ──────────────────────────────────────────
@app.post("/api/classify/{swing_id}")
async def classify(swing_id: str):
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)

    text = json.dumps(record.features or {}) + " " + json.dumps(record.topology or {})
    result = classify_text(text)
    store.update(
        swing_id,
        classification=result["classification"],
        classification_confidence=result["confidence"],
        status="classified",
    )
    return {"id": swing_id, **result, "status": "classified"}


# ─── FULL PIPELINE ───────────────────────────────────────────
async def _analyze_swing(swing_id: str):
    """Core analysis logic (called by endpoint and internal callers)."""
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)

    steps = []

    # Step 1: features
    feat_resp = await extract_features(swing_id)
    steps.append({"step": "features", "result": feat_resp})

    # Step 2: encode
    enc_resp = await encode(swing_id)
    steps.append({"step": "encode", "result": enc_resp})

    # Step 3: classify
    cls_resp = await classify(swing_id)
    steps.append({"step": "classify", "result": cls_resp})

    # Step 4: user-trained classifier (overrides rule-based if available)
    record = store.load(swing_id)
    embedding = (record.topology or {}).get("embedding", []) if record else []
    if embedding and motion_classifier.get_label_counts():
        user_prediction = motion_classifier.predict(embedding)
        if user_prediction["label"]:
            store.update(swing_id, classification=user_prediction["label"], classification_confidence=user_prediction["confidence"])
            steps.append({"step": "user_classifier", "result": user_prediction})

    record = store.load(swing_id)
    store.update(swing_id, status="analyzed")

    # Fire webhook if configured
    asyncio.create_task(_fire_webhook("session.analyzed", {
        "id": swing_id,
        "classification": record.classification if record else None,
        "confidence": record.classification_confidence if record else 0,
    }))

    logger.info("analyze swing_id=%s steps=%d", swing_id, len(steps))
    return {"id": swing_id, "status": "analyzed", "steps": steps, "record": record.to_dict() if record else None}


@app.post("/api/analyze/{swing_id}")
@limiter.limit("10/minute")
async def analyze(request: Request, swing_id: str):
    return await _analyze_swing(swing_id)


# ─── DATA QUALITY ────────────────────────────────────────────
@app.get("/api/swing/{swing_id}/quality")
async def check_quality(swing_id: str):
    """Run data quality analysis on a captured session."""
    if not sovereign_lib_available:
        return JSONResponse({"error": "sovereign-lib not available"}, status_code=503)

    csv_files = list(UPLOAD_DIR.glob(f"{swing_id}_*"))
    if not csv_files:
        return JSONResponse({"error": "CSV file not found"}, status_code=404)

    try:
        ts = IMUTimeSeries.from_csv(str(csv_files[0]))
        quality = analyze_quality(ts)
        return {"id": swing_id, **quality}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ─── BATCH ───────────────────────────────────────────────────
@app.post("/api/batch")
async def batch():
    all_swings = store.list_all()
    results = []
    for swing in all_swings:
        if swing["status"] in ("ingested", "features_extracted", "encoded"):
            try:
                result = await _analyze_swing(swing["id"])
                results.append(result)
            except Exception as e:
                results.append({"id": swing["id"], "error": str(e)})
    return {"processed": len(results), "results": results}


# ─── SWING CRUD ──────────────────────────────────────────────
@app.get("/api/swings")
async def list_swings(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
    label: str | None = Query(None),
    search: str | None = Query(None),
):
    all_records = store.list_all()
    if status:
        all_records = [r for r in all_records if r["status"] == status]
    if label:
        all_records = [r for r in all_records if r.get("user_label") == label or r.get("classification") == label]
    if search:
        q = search.lower()
        all_records = [r for r in all_records if q in (r.get("filename") or "").lower()
                       or q in (r.get("notes") or "").lower()
                       or q in (r.get("user_label") or "").lower()
                       or q in (r.get("classification") or "").lower()]
    all_records.reverse()  # newest first
    return all_records[offset:offset + limit]


@app.get("/api/swing/{swing_id}")
async def get_swing(swing_id: str):
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)
    return record.to_dict()


@app.delete("/api/swing/{swing_id}")
async def delete_swing(swing_id: str):
    """Delete a swing session and its uploaded file."""
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)
    # Remove store JSON
    store_path = DATA_DIR / "swings" / f"{swing_id}.json"
    if store_path.exists():
        store_path.unlink()
    # Remove upload CSV
    for f in UPLOAD_DIR.glob(f"{swing_id}_*"):
        f.unlink()
    # Remove baseline if exists
    baseline_path = BASELINE_DIR / f"{swing_id}.json"
    if baseline_path.exists():
        baseline_path.unlink()
    # Remove from classifier index
    motion_classifier.remove_label(swing_id)
    logger.info("deleted session %s", swing_id)
    return {"status": "deleted", "id": swing_id}


@app.patch("/api/swing/{swing_id}")
async def update_swing(swing_id: str, request: Request):
    """Update session notes, tags, and group."""
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)
    body = await request.json()
    updates = {}
    if "notes" in body:
        updates["notes"] = body["notes"]
    if "tags" in body:
        updates["tags"] = body["tags"]
    if "group" in body:
        updates["group"] = body["group"]
    if updates:
        store.update(swing_id, **updates)
    return {"status": "updated", "id": swing_id, **updates}


@app.put("/api/swing/{swing_id}/label")
async def set_label(swing_id: str, request: Request):
    """Set or update the user label for a session."""
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)
    body = await request.json()
    label = body.get("label", "").strip()
    if not label:
        return JSONResponse({"error": "Label cannot be empty"}, status_code=400)
    store.update(swing_id, user_label=label)
    embedding = (record.topology or {}).get("embedding", [])
    if embedding:
        motion_classifier.add_label(swing_id, label, embedding)
    reclassified = False
    if embedding:
        prediction = motion_classifier.predict(embedding)
        if prediction["label"]:
            store.update(swing_id, classification=prediction["label"], classification_confidence=prediction["confidence"])
            reclassified = True
    return {"id": swing_id, "user_label": label, "reclassified": reclassified}


@app.delete("/api/swing/{swing_id}/label")
async def remove_label(swing_id: str):
    """Remove user label from a session."""
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)
    store.update(swing_id, user_label=None)
    motion_classifier.remove_label(swing_id)
    return {"id": swing_id, "user_label": None}


@app.get("/api/classifier/status")
async def classifier_status():
    counts = motion_classifier.get_label_counts()
    mlp = getattr(motion_classifier, 'mlp', None) or getattr(motion_classifier, '_mlp', None)
    return {
        "total_labeled": sum(counts.values()),
        "classes": counts,
        "labels": motion_classifier.get_labels(),
        "mlp_trained": mlp is not None and "weights" in (mlp or {}),
        "mlp_accuracy": mlp.get("accuracy") if mlp else None,
        "mlp_trained_at": mlp.get("trained_at") if mlp else None,
        "can_train": motion_classifier.can_train_mlp(),
        "method": "mlp" if (mlp and "weights" in (mlp or {})) else "knn",
    }


@app.post("/api/classifier/train")
@limiter.limit("10/minute")
async def train_classifier(request: Request):
    if not motion_classifier.can_train_mlp():
        return JSONResponse({"error": "Need at least 2 classes and 10+ examples in one class"}, status_code=400)
    result = motion_classifier.train_mlp()
    logger.info("classifier train result=%s", result)
    return result


@app.post("/api/classifier/reclassify")
async def reclassify_all():
    all_swings = store.list_all()
    updated = 0
    for summary in all_swings:
        record = store.load(summary["id"])
        if not record or record.status != "analyzed":
            continue
        embedding = (record.topology or {}).get("embedding", [])
        if not embedding:
            continue
        prediction = motion_classifier.predict(embedding)
        if prediction["label"]:
            store.update(summary["id"], classification=prediction["label"], classification_confidence=prediction["confidence"])
            updated += 1
    return {"reclassified": updated, "total_analyzed": len(all_swings)}


@app.get("/api/stats")
async def get_stats():
    """Aggregate statistics across all sessions."""
    all_swings = store.list_all()
    total = len(all_swings)
    analyzed = sum(1 for s in all_swings if s.get("status") == "analyzed")
    classifications = {}
    for s in all_swings:
        c = s.get("classification")
        if c:
            classifications[c] = classifications.get(c, 0) + 1
    labeled = sum(1 for s in all_swings if s.get("user_label"))
    return {
        "total_sessions": total,
        "analyzed": analyzed,
        "labeled": labeled,
        "classifications": classifications,
        "baselines": len(list(BASELINE_DIR.glob("*.json"))),
    }


@app.get("/api/groups")
async def list_groups():
    """List all workout groups with session counts."""
    all_swings = store.list_all()
    groups = {}
    ungrouped = 0
    for s in all_swings:
        g = s.get("group")
        if g:
            if g not in groups:
                groups[g] = {"name": g, "count": 0, "analyzed": 0, "sessions": []}
            groups[g]["count"] += 1
            groups[g]["sessions"].append(s["id"])
            if s.get("status") == "analyzed":
                groups[g]["analyzed"] += 1
        else:
            ungrouped += 1
    return {
        "groups": list(groups.values()),
        "ungrouped": ungrouped,
        "total": len(all_swings),
    }


WEBHOOKS_FILE = DATA_DIR / "webhooks.json"


def _load_webhooks() -> list[dict]:
    if WEBHOOKS_FILE.exists():
        try:
            return json.loads(WEBHOOKS_FILE.read_text())
        except Exception:
            pass
    return []


def _save_webhooks(hooks: list[dict]) -> None:
    WEBHOOKS_FILE.write_text(json.dumps(hooks, indent=2))


def _count_phases(phases_list: list) -> dict:
    """Count samples per motion phase label."""
    counts: dict[str, int] = {}
    for p in phases_list:
        label = p.get("label") or p.get("phase") or "unknown"
        n = p.get("samples", p.get("count", 1))
        counts[label] = counts.get(label, 0) + n
    return counts


async def _fire_webhook(event: str, payload: dict) -> None:
    """Fire all registered webhooks for an event type."""
    import aiohttp
    hooks = _load_webhooks()
    active = [h for h in hooks if h.get("active", True) and event in h.get("events", [])]
    if not active:
        return
    body = json.dumps({"event": event, "data": payload, "timestamp": datetime.now(timezone.utc).isoformat()})
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
            for hook in active:
                try:
                    await session.post(hook["url"], data=body, headers={"Content-Type": "application/json"})
                except Exception:
                    pass  # best-effort
    except ImportError:
        # aiohttp not installed — try requests as fallback
        import requests as req
        for hook in active:
            try:
                req.post(hook["url"], json={"event": event, "data": payload}, timeout=5)
            except Exception:
                pass


@app.get("/api/webhooks")
async def list_webhooks():
    return _load_webhooks()


@app.post("/api/webhooks")
async def add_webhook(request: Request):
    body = await request.json()
    url = body.get("url", "").strip()
    if not url:
        return JSONResponse({"error": "url is required"}, status_code=400)
    # Validate webhook URL — must be HTTPS in production, block internal IPs
    from urllib.parse import urlparse
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return JSONResponse({"error": "url must use http or https"}, status_code=400)
    if parsed.hostname in ("localhost", "127.0.0.1", "0.0.0.0", "::1") or (parsed.hostname or "").startswith("192.168.") or (parsed.hostname or "").startswith("10."):
        return JSONResponse({"error": "Webhook URLs cannot target internal/private addresses"}, status_code=400)
    hooks = _load_webhooks()
    hook = {
        "id": str(len(hooks) + 1),
        "url": url,
        "events": body.get("events", ["session.analyzed"]),
        "active": True,
    }
    hooks.append(hook)
    _save_webhooks(hooks)
    return {"status": "created", "webhook": hook}


@app.delete("/api/webhooks/{hook_id}")
async def delete_webhook(hook_id: str):
    hooks = _load_webhooks()
    hooks = [h for h in hooks if h.get("id") != hook_id]
    _save_webhooks(hooks)
    return {"status": "deleted", "id": hook_id}


DEFAULT_SETTINGS = {
    "sensor": {
        "threshold_mg": 1500,
        "capture_duration_s": 5,
        "cooldown_s": 2,
        "sample_rate_hz": 500,
        "auto_analyze": True,
    },
    "analysis": {
        "quality_threshold": 0.5,
        "min_samples": 100,
        "phase_detection": True,
        "topology_encoding": True,
        "auto_classify": True,
    },
    "display": {
        "chart_height": 200,
        "downsample_factor": 2,
        "show_phase_overlay": True,
        "dark_theme": True,
    },
    "export": {
        "include_raw_features": True,
        "include_topology": True,
        "csv_separator": ",",
    },
}


def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            saved = json.loads(SETTINGS_FILE.read_text())
            # Merge with defaults to pick up new keys
            merged = {}
            for section, defaults in DEFAULT_SETTINGS.items():
                merged[section] = {**defaults, **saved.get(section, {})}
            return merged
        except Exception:
            pass
    return {**DEFAULT_SETTINGS}


def _save_settings(settings: dict) -> None:
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2))


@app.get("/api/settings")
async def get_settings():
    return _load_settings()


@app.put("/api/settings")
async def update_settings(request: Request):
    body = await request.json()
    current = _load_settings()
    for section, values in body.items():
        if section in current and isinstance(values, dict):
            current[section].update(values)
    _save_settings(current)
    return {"status": "saved", "settings": current}


@app.get("/api/anomalies")
async def get_anomalies():
    """Detect sessions that deviate significantly from the baseline."""
    all_swings = store.list_all()
    analyzed = []
    for summary in all_swings:
        record = store.load(summary["id"])
        if record and record.status == "analyzed":
            analyzed.append(record)
    if len(analyzed) < 3:
        return {"anomalies": [], "message": "Need at least 3 sessions for anomaly detection"}

    # Build baseline stats (mean, std) for key metrics
    metrics_keys = ["peak_accel_magnitude", "duration_s", "sample_rate_hz", "data_quality_score"]
    topo_keys = ["total_persistence", "betti_0", "betti_1"]
    baselines: dict[str, dict] = {}
    for key in metrics_keys:
        vals = [r.features.get(key) for r in analyzed if r.features and r.features.get(key) is not None]
        if len(vals) >= 2:
            mean = sum(vals) / len(vals)
            std = (sum((v - mean) ** 2 for v in vals) / (len(vals) - 1)) ** 0.5
            baselines[key] = {"mean": mean, "std": max(std, 1e-9)}
    for key in topo_keys:
        vals = []
        for r in analyzed:
            t = r.topology or {}
            v = t.get(key, t.get("persistence", {}).get(key))
            if v is not None:
                vals.append(v)
        if len(vals) >= 2:
            mean = sum(vals) / len(vals)
            std = (sum((v - mean) ** 2 for v in vals) / (len(vals) - 1)) ** 0.5
            baselines[key] = {"mean": mean, "std": max(std, 1e-9)}

    # Check each session for anomalies (z-score > 2)
    anomalies = []
    threshold = 2.0
    for record in analyzed:
        deviations = []
        feat = record.features or {}
        topo = record.topology or {}
        for key, bl in baselines.items():
            if key in metrics_keys:
                val = feat.get(key)
            else:
                val = topo.get(key, topo.get("persistence", {}).get(key))
            if val is None:
                continue
            z = abs(val - bl["mean"]) / bl["std"]
            if z > threshold:
                deviations.append({
                    "metric": key,
                    "value": round(val, 4),
                    "mean": round(bl["mean"], 4),
                    "std": round(bl["std"], 4),
                    "z_score": round(z, 2),
                    "direction": "high" if val > bl["mean"] else "low",
                })
        if deviations:
            anomalies.append({
                "id": record.id,
                "filename": record.filename,
                "classification": record.classification,
                "deviations": deviations,
                "severity": max(d["z_score"] for d in deviations),
            })
    anomalies.sort(key=lambda a: a["severity"], reverse=True)
    return {"anomalies": anomalies, "baselines": {k: {"mean": round(v["mean"], 4), "std": round(v["std"], 4)} for k, v in baselines.items()}}


@app.get("/api/trends")
async def get_trends():
    """Per-session metrics in chronological order for trend charting."""
    all_swings = store.list_all()
    points = []
    for summary in all_swings:
        record = store.load(summary["id"])
        if not record or record.status != "analyzed":
            continue
        feat = record.features or {}
        topo = record.topology or {}
        pers = topo.get("persistence", {})
        phases = topo.get("phases", {})
        quality = feat.get("data_quality_score", feat.get("quality_score"))
        emb = topo.get("embedding", [])
        points.append({
            "id": record.id,
            "filename": record.filename,
            "classification": record.classification,
            "confidence": record.classification_confidence,
            "quality_score": quality,
            "peak_accel": feat.get("peak_accel_magnitude"),
            "duration_s": feat.get("duration_s"),
            "sample_rate": feat.get("sample_rate_hz"),
            "feature_count": len(feat),
            "betti_0": pers.get("betti_0", topo.get("betti_0")),
            "betti_1": pers.get("betti_1", topo.get("betti_1")),
            "total_persistence": topo.get("total_persistence"),
            "n_phases": len(phases.get("phases", [])),
            "phase_counts": _count_phases(phases.get("phases", [])),
            "embedding_norm": sum(x ** 2 for x in emb) ** 0.5 if emb else None,
            "tags": record.tags,
            "user_label": record.user_label,
        })
    return {"sessions": points, "count": len(points)}


@app.get("/api/export/csv")
async def export_csv():
    """Export all sessions as a flat CSV for data analysis."""
    import io
    import csv

    all_swings = store.list_all()
    if not all_swings:
        return JSONResponse({"error": "No sessions to export"}, status_code=404)

    # Collect all feature keys across sessions
    feature_keys = set()
    records = []
    for summary in all_swings:
        record = store.load(summary["id"])
        if record:
            records.append(record)
            if record.features:
                feature_keys.update(record.features.keys())

    feature_keys = sorted(feature_keys)

    # Build CSV
    output = io.StringIO()
    base_cols = ["id", "filename", "status", "classification", "confidence",
                 "betti_0", "betti_1", "total_persistence", "n_phases"]
    writer = csv.writer(output)
    writer.writerow(base_cols + feature_keys)

    for r in records:
        topo = r.topology or {}
        phases = topo.get("phases", {})
        row = [
            r.id,
            r.filename,
            r.status,
            r.classification,
            r.classification_confidence,
            topo.get("betti_0", topo.get("persistence", {}).get("betti_0")),
            topo.get("betti_1", topo.get("persistence", {}).get("betti_1")),
            topo.get("total_persistence"),
            len(phases.get("phases", [])),
        ]
        feat = r.features or {}
        row.extend(feat.get(k) for k in feature_keys)
        writer.writerow(row)

    from starlette.responses import Response
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sovereign_motion_export.csv"},
    )


@app.get("/api/export/json")
async def export_json():
    """Export all sessions as a JSON array with full features and topology."""
    all_swings = store.list_all()
    if not all_swings:
        return JSONResponse({"error": "No sessions to export"}, status_code=404)
    records = []
    for summary in all_swings:
        record = store.load(summary["id"])
        if record:
            records.append(record.to_dict())
    return JSONResponse(
        content=records,
        headers={"Content-Disposition": "attachment; filename=sovereign_motion_export.json"},
    )


@app.get("/api/swing/{swing_id}/report")
async def get_swing_report(swing_id: str):
    """Generate a comprehensive analysis report for a session."""
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)

    report = {
        "id": swing_id,
        "filename": record.filename,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "session_meta": record.session_meta,
        "status": record.status,
    }

    # Feature summary
    if record.features:
        feat = record.features
        report["feature_summary"] = {
            "total_features": len(feat),
            "duration_s": feat.get("duration_s"),
            "sample_rate_hz": feat.get("sample_rate_hz"),
            "n_samples": feat.get("n_samples"),
            "peak_acceleration_mg": feat.get("accel_mag_max"),
            "peak_angular_velocity_mdps": feat.get("gyro_mag_max"),
            "motion_smoothness": feat.get("smoothness"),
            "jerk_ratio": feat.get("jerk_ratio"),
            "accel_entropy": feat.get("accel_entropy"),
            "cross_axis_correlations": {
                "ax_ay": feat.get("corr_ax_ay"),
                "ax_az": feat.get("corr_ax_az"),
                "ay_az": feat.get("corr_ay_az"),
            },
        }
        report["all_features"] = feat

    # Topology summary
    if record.topology:
        topo = record.topology
        report["topology_summary"] = {
            "betti_0": topo.get("betti_0"),
            "betti_1": topo.get("betti_1"),
            "total_persistence": topo.get("total_persistence"),
            "max_persistence": topo.get("max_persistence"),
            "persistence_entropy": topo.get("persistence_entropy"),
            "embedding_dimension": len(topo.get("embedding", [])),
            "point_cloud": topo.get("point_cloud_stats"),
        }
        if topo.get("phases"):
            phases = topo["phases"]
            report["phase_analysis"] = {
                "n_phases": phases.get("summary", {}).get("n_phases"),
                "active_duration_s": phases.get("summary", {}).get("active_duration_s"),
                "peak_gyro_mdps": phases.get("summary", {}).get("peak_gyro_mdps"),
                "peak_accel_mg": phases.get("summary", {}).get("peak_accel_mg"),
                "phase_durations": phases.get("summary", {}).get("phase_durations"),
                "phases": [{"start": s, "end": e, "name": n} for s, e, n in phases.get("phases", [])],
                "events": [{"index": i, "type": t} for i, t in phases.get("events", [])],
            }

    # Classification
    if record.classification:
        report["classification"] = {
            "class": record.classification,
            "confidence": record.classification_confidence,
        }

    if record.coaching_notes:
        report["coaching_notes"] = record.coaching_notes

    return report


@app.get("/api/swing/{swing_id}/data")
async def get_swing_data(swing_id: str, downsample: int = 1):
    """Return parsed CSV time-series as JSON for charting."""
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)

    # Find the CSV file
    csv_files = list(UPLOAD_DIR.glob(f"{swing_id}_*"))
    if not csv_files:
        return JSONResponse({"error": "CSV file not found"}, status_code=404)

    text = csv_files[0].read_text(encoding="utf-8-sig")
    lines = text.splitlines()

    imu_samples = []
    impact_samples = []
    in_impact = False
    header = None
    impact_header = None

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("# impact_section"):
            in_impact = True
            continue
        if stripped.startswith("#"):
            continue

        if in_impact and impact_header is None:
            impact_header = [c.strip() for c in stripped.split(",")]
            continue
        if not in_impact and header is None:
            header = [c.strip() for c in stripped.split(",")]
            continue

        cols = stripped.split(",")
        if in_impact and impact_header:
            row = {}
            for i, col in enumerate(impact_header):
                if i < len(cols):
                    try:
                        row[col] = int(cols[i]) if "idx" in col else float(cols[i])
                    except ValueError:
                        row[col] = cols[i].strip()
            impact_samples.append(row)
        elif header:
            row = {}
            for i, col in enumerate(header):
                if i < len(cols):
                    try:
                        row[col] = float(cols[i])
                    except ValueError:
                        row[col] = cols[i].strip()
            imu_samples.append(row)

    # Downsample if requested (e.g., downsample=5 keeps every 5th sample)
    ds = max(1, downsample)
    if ds > 1:
        imu_samples = imu_samples[::ds]

    return {
        "swing_id": swing_id,
        "imu_count": len(imu_samples),
        "impact_count": len(impact_samples),
        "imu": imu_samples,
        "impact": impact_samples,
    }


# ─── BASELINES ───────────────────────────────────────────────
@app.get("/api/baselines")
async def list_baselines():
    baselines = []
    for path in sorted(BASELINE_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text())
            baselines.append(data)
        except Exception:
            pass
    return baselines


@app.post("/api/baselines/{swing_id}")
async def save_baseline(swing_id: str, request: Request):
    """Save a session as a named baseline for comparison."""
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)

    body = await request.json() if request.headers.get("content-type") == "application/json" else {}
    label = body.get("label", f"Baseline {swing_id}")

    baseline = {
        "id": swing_id,
        "label": label,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "features": record.features,
        "topology": record.topology,
        "classification": record.classification,
        "session_meta": record.session_meta,
    }

    baseline_path = BASELINE_DIR / f"{swing_id}.json"
    baseline_path.write_text(json.dumps(baseline, indent=2))

    return {"status": "saved", "id": swing_id, "label": label}


@app.delete("/api/baselines/{swing_id}")
async def delete_baseline(swing_id: str):
    """Delete a baseline."""
    baseline_path = BASELINE_DIR / f"{swing_id}.json"
    if not baseline_path.exists():
        return JSONResponse({"error": "Baseline not found"}, status_code=404)
    baseline_path.unlink()
    return {"status": "deleted", "id": swing_id}


# ─── SIGNALS ─────────────────────────────────────────────────
@app.get("/api/signals")
async def get_signals():
    import copy
    signals = copy.deepcopy(SIGNALS)

    # Dynamically update data inventory signals
    all_swings = store.list_all()
    for sig in signals:
        if sig["id"] == "swings_ingested":
            sig["value"] = len(all_swings)
            sig["status"] = "green" if len(all_swings) > 0 else "gray"
        elif sig["id"] == "ground_truth_coverage":
            with_gt = sum(1 for s in all_swings if store.load(s["id"]) and store.load(s["id"]).ground_truth)
            sig["value"] = round(with_gt / len(all_swings) * 100, 1) if all_swings else 0
            sig["status"] = "green" if sig["value"] > 50 else ("yellow" if sig["value"] > 0 else "gray")
        elif sig["id"] == "baseline_count":
            sig["value"] = len(list(BASELINE_DIR.glob("*.json")))
            sig["status"] = "green" if sig["value"] > 0 else "gray"
        elif sig["id"] == "unprocessed_queue":
            sig["value"] = sum(1 for s in all_swings if s["status"] in ("ingested",))
            sig["status"] = "yellow" if sig["value"] > 0 else "green"

    # Update LLM signals
    llm_status = llm.status()
    for sig in signals:
        if sig["id"] == "gpu_model_status":
            sig["value"] = 1 if llm_status.gpu_loaded else 0
            sig["status"] = "green" if llm_status.gpu_loaded else "offline"
        elif sig["id"] == "cpu_model_status":
            sig["value"] = 1 if llm_status.cpu_loaded else 0
            sig["status"] = "green" if llm_status.cpu_loaded else "offline"
        elif sig["id"] == "gpu_vram":
            sig["value"] = round(llm_status.gpu_vram_used_bytes / 1024 / 1024, 1)
            sig["status"] = "green" if llm_status.gpu_vram_used_bytes > 0 else "gray"

    # Add dynamic sensor and quality signals from most recent analyzed session
    analyzed = [s for s in all_swings if s.get("status") == "analyzed"]
    if analyzed:
        latest = store.load(analyzed[-1]["id"])
        if latest:
            feat = latest.features or {}
            topo = latest.topology or {}

            # IMU signals from latest session
            if feat.get("sample_rate_hz"):
                signals.append({
                    "id": "latest_sample_rate", "category": "imu",
                    "label": "Latest Sample Rate",
                    "value": f"{feat['sample_rate_hz']:.0f} Hz",
                    "severity": "green" if 400 < feat["sample_rate_hz"] < 600 else "yellow",
                })
            if feat.get("duration_s"):
                signals.append({
                    "id": "latest_duration", "category": "imu",
                    "label": "Latest Duration",
                    "value": f"{feat['duration_s']:.1f}s",
                    "severity": "green" if feat["duration_s"] > 2 else "yellow",
                })

            # Feature pipeline signals
            n_features = len(feat)
            signals.append({
                "id": "feature_count", "category": "features",
                "label": "Features Extracted",
                "value": n_features,
                "severity": "green" if n_features >= 80 else "yellow" if n_features > 0 else "red",
            })
            if feat.get("accel_mag_max"):
                signals.append({
                    "id": "peak_accel", "category": "features",
                    "label": "Peak Acceleration",
                    "value": f"{feat['accel_mag_max']:.0f} mg",
                    "severity": "green",
                })

            # Topology signals
            b0 = topo.get("betti_0", topo.get("persistence", {}).get("betti_0"))
            b1 = topo.get("betti_1", topo.get("persistence", {}).get("betti_1"))
            if b0 is not None:
                signals.append({
                    "id": "betti_0", "category": "topology",
                    "label": "Betti-0 (Components)",
                    "value": b0,
                    "severity": "green",
                })
            if b1 is not None:
                signals.append({
                    "id": "betti_1", "category": "topology",
                    "label": "Betti-1 (Loops)",
                    "value": b1,
                    "severity": "green" if b1 > 0 else "yellow",
                })
            if topo.get("total_persistence"):
                signals.append({
                    "id": "total_persistence", "category": "topology",
                    "label": "Total Persistence",
                    "value": f"{topo['total_persistence']:.3f}",
                    "severity": "green",
                })
            if topo.get("embedding"):
                signals.append({
                    "id": "embedding_dim", "category": "topology",
                    "label": "Embedding Dimension",
                    "value": f"{len(topo['embedding'])}D",
                    "severity": "green",
                })

    # Add sensor connectivity signal
    try:
        sensor_status = _get_sensor_status()
        signals.append({
            "id": "sensor_connected", "category": "imu",
            "label": "PROTEUS1 Sensor",
            "value": "Connected" if sensor_status.get("connected") else "Disconnected",
            "severity": "green" if sensor_status.get("connected") else "red",
        })
    except Exception:
        pass

    return {"signals": signals, "categories": CATEGORY_META, "timestamp": datetime.now(timezone.utc).isoformat()}


# ─── LLM STATUS ──────────────────────────────────────────────
@app.get("/api/llm/status")
async def llm_status():
    status = llm.status()
    return {
        "gpu_model": status.gpu_model,
        "cpu_model": status.cpu_model,
        "gpu_vram_used_mb": round(status.gpu_vram_used_bytes / 1024 / 1024, 1),
        "cpu_ram_used_mb": round(status.cpu_ram_used_bytes / 1024 / 1024, 1),
        "gpu_loaded": status.gpu_loaded,
        "cpu_loaded": status.cpu_loaded,
    }


# ─── COACHING ────────────────────────────────────────────────
def _rule_based_coaching(record: SwingRecord) -> str:
    """Generate coaching advice from features and topology without LLM."""
    notes = []
    feat = record.features or {}
    topo = record.topology or {}
    pers = topo.get("persistence", {})
    phases = topo.get("phases", {})

    # Data quality
    quality = feat.get("data_quality_score", feat.get("quality_score"))
    if quality is not None:
        if quality < 0.3:
            notes.append("Data quality is low — check sensor placement and ensure firm mounting.")
        elif quality < 0.6:
            notes.append("Data quality is moderate. Consider reducing movement artifacts.")

    # Duration check
    dur = feat.get("duration_s")
    if dur is not None:
        if dur < 0.5:
            notes.append(f"Session very short ({dur:.1f}s). Ensure full motion cycle is captured.")
        elif dur > 30:
            notes.append(f"Session is {dur:.1f}s — consider trimming to active motion window.")

    # Peak acceleration
    peak = feat.get("peak_accel_magnitude", feat.get("accel_mag_max"))
    if peak is not None:
        if peak > 50000:
            notes.append(f"Very high peak acceleration ({peak:.0f} mg). Verify sensor range isn't saturated.")
        elif peak < 500:
            notes.append("Low peak acceleration — motion may be too gentle for meaningful analysis.")

    # Smoothness
    smooth = feat.get("smoothness")
    if smooth is not None:
        if smooth < 0.3:
            notes.append("Motion is jerky (low smoothness). Focus on fluid, controlled movement.")
        elif smooth > 0.8:
            notes.append("Excellent motion smoothness — consistent kinematic chain.")

    # Phase analysis
    n_phases = len(phases.get("phases", []))
    if n_phases < 4:
        notes.append(f"Only {n_phases} phases detected. A complete motion should have 5-8 distinct phases.")
    elif n_phases >= 7:
        notes.append(f"Full {n_phases}-phase motion detected — well-structured movement pattern.")

    # Topology
    b0 = pers.get("betti_0", topo.get("betti_0"))
    b1 = pers.get("betti_1", topo.get("betti_1"))
    total_p = topo.get("total_persistence")

    if b0 is not None and b1 is not None:
        if b1 == 0:
            notes.append("No H1 loops in topology — motion path is tree-like. Consider adding rotational elements.")
        elif b1 > 5:
            notes.append(f"Rich topological structure (Betti-1={b1}). Complex motion with multiple loop patterns.")

    if total_p is not None:
        if total_p < 0.5:
            notes.append("Low total persistence — topological features are weak. Motion may lack distinctive structure.")
        elif total_p > 5:
            notes.append("High total persistence — strong, distinct topological signature.")

    # Classification
    if record.classification:
        cls = record.classification.upper()
        conf = record.classification_confidence or 0
        if conf > 0.8:
            notes.append(f"Classified as {cls} with high confidence ({conf*100:.0f}%).")
        elif conf < 0.5:
            notes.append(f"Classification uncertain ({cls} at {conf*100:.0f}%). Motion pattern is ambiguous.")

    if not notes:
        notes.append("Session captured and analyzed. Upload more sessions to enable trend comparison.")

    return " ".join(notes)


async def _coach_swing(swing_id: str):
    """Core coaching logic (called by endpoint and internal callers)."""
    record = store.load(swing_id)
    if not record:
        return JSONResponse({"error": "Swing not found"}, status_code=404)

    prompt = f"""Analyze this motion capture session and provide coaching notes.

Classification: {record.classification}
Confidence: {record.classification_confidence}
Features: {json.dumps(record.features or {}, indent=2)}
Topology: {json.dumps(record.topology or {}, indent=2)}
Ground Truth: {json.dumps(record.ground_truth, indent=2)}

Provide specific, actionable coaching advice based on the motion data:"""

    notes = None
    try:
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(llm.infer_gpu, prompt, 512)
            notes = future.result(timeout=30)
    except (concurrent.futures.TimeoutError, RuntimeError):
        pass

    # Rule-based coaching fallback when LLM unavailable
    if not notes or notes.startswith("("):
        notes = _rule_based_coaching(record)

    store.update(swing_id, coaching_notes=notes, status="coached")
    return {"id": swing_id, "coaching_notes": notes, "status": "coached"}


@app.post("/api/coach/{swing_id}")
@limiter.limit("10/minute")
async def coach(request: Request, swing_id: str):
    return await _coach_swing(swing_id)


# ─── AGENT ENDPOINTS ─────────────────────────────────────────
@app.get("/api/agent/plan")
async def agent_plan():
    all_swings = store.list_all()
    unprocessed = [s for s in all_swings if s["status"] == "ingested"]
    needs_coaching = [s for s in all_swings if s["status"] == "classified"]
    return {
        "total_swings": len(all_swings),
        "unprocessed": len(unprocessed),
        "needs_coaching": len(needs_coaching),
        "plan": [
            {"action": "analyze", "targets": [s["id"] for s in unprocessed]},
            {"action": "coach", "targets": [s["id"] for s in needs_coaching]},
        ],
    }


@app.get("/api/agent/dashboard")
async def agent_dashboard():
    all_swings = store.list_all()
    status_counts: dict[str, int] = {}
    for s in all_swings:
        status_counts[s["status"]] = status_counts.get(s["status"], 0) + 1
    llm_s = llm.status()
    return {
        "swing_count": len(all_swings),
        "status_breakdown": status_counts,
        "llm": {"gpu_loaded": llm_s.gpu_loaded, "cpu_loaded": llm_s.cpu_loaded},
        "sovereign_lib_available": sovereign_lib_available,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/agent/loop")
@limiter.limit("10/minute")
async def agent_loop(request: Request):
    plan = await agent_plan()
    results = []
    for action in plan["plan"]:
        for target_id in action["targets"]:
            try:
                if action["action"] == "analyze":
                    r = await _analyze_swing(target_id)
                elif action["action"] == "coach":
                    r = await _coach_swing(target_id)
                else:
                    r = {"skipped": True}
                results.append({"id": target_id, "action": action["action"], "result": r})
            except Exception as e:
                results.append({"id": target_id, "action": action["action"], "error": str(e)})
    return {"executed": len(results), "results": results}


# ─── DISTILL ─────────────────────────────────────────────────
@app.post("/api/distill")
@limiter.limit("10/minute")
async def distill(request: Request):
    all_swings = store.list_all()
    coached = [s for s in all_swings if s["status"] == "coached"]
    if not coached:
        return {"status": "no_data", "message": "No coached swings to distill"}

    summaries = []
    for s in coached:
        record = store.load(s["id"])
        if record and record.coaching_notes:
            summaries.append(record.coaching_notes)

    combined = "\n---\n".join(summaries)
    prompt = f"""Synthesize these individual coaching notes into a concise training curriculum.
Focus on common patterns and prioritize the most impactful improvements.

{combined}

Curriculum:"""

    try:
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(llm.infer_cpu, prompt, 1024)
            curriculum = future.result(timeout=30)
    except concurrent.futures.TimeoutError:
        curriculum = "(LLM inference timed out after 30s)"
    except RuntimeError:
        curriculum = "(No CPU model loaded — load a CPU model for batch distillation)"

    return {"status": "distilled", "swing_count": len(coached), "curriculum": curriculum}


# ─── CURRICULUM ──────────────────────────────────────────────
@app.post("/api/curriculum")
async def create_curriculum():
    return await distill()


# ─── MODELS ──────────────────────────────────────────────────
@app.get("/api/models")
async def list_models():
    models_dir = SOVEREIGN_LIB / "checkpoints"
    available = []
    if models_dir.exists():
        for f in models_dir.glob("*.gguf"):
            available.append({"name": f.stem, "path": str(f), "size_mb": round(f.stat().st_size / 1024 / 1024, 1)})
    status = llm.status()
    return {
        "available": available,
        "loaded": {
            "gpu": status.gpu_model,
            "cpu": status.cpu_model,
        },
    }


@app.post("/api/models/swap")
async def swap_model(request: Request):
    body = await request.json()
    slot = body.get("slot", "gpu")
    model_path = body.get("model_path", "")
    model_name = body.get("model_name", Path(model_path).stem if model_path else "unknown")

    if not model_path:
        return JSONResponse({"error": "model_path required"}, status_code=400)

    if slot == "gpu":
        llm.load_gpu(model_path, model_name)
    elif slot == "cpu":
        llm.load_cpu(model_path, model_name)
    else:
        return JSONResponse({"error": f"Unknown slot: {slot}"}, status_code=400)

    return {"status": "loaded", "slot": slot, "model_name": model_name}


# ─── COMPARE ────────────────────────────────────────────────
@app.get("/api/compare")
async def compare(a: str = Query(...), b: str = Query(...)):
    rec_a = store.load(a)
    rec_b = store.load(b)
    if not rec_a:
        return JSONResponse({"error": f"Swing {a} not found"}, status_code=404)
    if not rec_b:
        return JSONResponse({"error": f"Swing {b} not found"}, status_code=404)

    diff = {}
    if rec_a.features and rec_b.features:
        all_keys = set(list(rec_a.features.keys()) + list(rec_b.features.keys()))
        for key in sorted(all_keys):
            val_a = rec_a.features.get(key, 0)
            val_b = rec_b.features.get(key, 0)
            diff[key] = {"a": val_a, "b": val_b, "delta": round(val_b - val_a, 4)}

    # Topological signature comparison
    topo_comparison = None
    if rec_a.topology and rec_b.topology and sovereign_lib_available:
        try:
            from sovereign_topo.encode import compare_signatures
            topo_comparison = compare_signatures(rec_a.topology, rec_b.topology)
        except Exception as e:
            topo_comparison = {"error": str(e)}

    return {
        "a": rec_a.to_dict(),
        "b": rec_b.to_dict(),
        "feature_diff": diff,
        "topo_comparison": topo_comparison,
    }


# ─── SERVE FRONTEND (SPA) ────────────────────────────────────
if STATIC_DIR.exists():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        file_path = STATIC_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        index = STATIC_DIR / "index.html"
        if index.exists():
            return FileResponse(index)
        return JSONResponse({"error": "Frontend not built"}, status_code=404)


# ─── ENTRY POINT ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    logger.info("Starting Sovereign Motion API data_dir=%s port=%d", DATA_DIR, port)
    uvicorn.run(app, host="0.0.0.0", port=port)
