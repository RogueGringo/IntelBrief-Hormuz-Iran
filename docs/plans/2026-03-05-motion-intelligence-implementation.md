# Motion Intelligence Frontend — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform IntelAction_PanelZ from a geopolitical intelligence dashboard into a motion intelligence front/middle end for sovereign-lib using surgical transplant approach.

**Architecture:** React 18 + Vite frontend with 7 remapped tabs, FastAPI middle layer bridging sovereign-lib via hybrid coupling (direct import hot path, CLI cold path), dual local LLM (GPU 8B + CPU 32B) via llama-cpp-python.

**Tech Stack:** React 18, Vite 5, FastAPI, sovereign-lib (sovereign_motion, sovereign_topo, sovereign_ioa, sovereign_agent), llama-cpp-python, GGUF models, pytest, vitest.

**Design doc:** `docs/plans/2026-03-05-motion-intelligence-frontend-design.md`

**sovereign-lib location:** `C:\Claude\New folder\sovereign-lib`

---

## Task 1: Project Foundation — Update Configs and Dependencies

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Modify: `README.md`

**Step 1: Update package.json**

```json
{
  "name": "sovereign-motion-dashboard",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
```

Changes: rename to "sovereign-motion-dashboard", bump version to 2.0.0, remove gh-pages (no longer deploying to GitHub Pages — local deployment).

**Step 2: Update vite.config.js**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:7860'
    }
  }
})
```

Changes: remove `base: '/IntelBrief-Hormuz-Iran/'`, add dev proxy to FastAPI backend.

**Step 3: Update README.md**

```markdown
# Sovereign Motion Dashboard

Front and middle end for [sovereign-lib](../sovereign-lib/) — topological motion intelligence.

## Architecture

- **Frontend:** React 18 + Vite — 7-tab motion intelligence dashboard
- **Middle Layer:** FastAPI bridging sovereign-lib (hot path: direct import, cold path: CLI)
- **LLM Runtime:** Dual model — GPU 8B (real-time) + CPU 32B (batch)

## Quick Start

```bash
# Backend
cd hf-proxy
pip install -e ".[all]"
python app.py

# Frontend
npm install
npm run dev
```
```

**Step 4: Commit**

```bash
git add package.json vite.config.js README.md
git commit -m "chore: update project foundation for motion intelligence dashboard"
```

---

## Task 2: Python Backend — Requirements and Project Structure

**Files:**
- Modify: `hf-proxy/requirements.txt`
- Create: `hf-proxy/pyproject.toml`
- Create: `hf-proxy/llm_manager.py`
- Create: `hf-proxy/tests/__init__.py`
- Create: `hf-proxy/tests/test_llm_manager.py`

**Step 1: Update hf-proxy/requirements.txt**

```
fastapi>=0.104
uvicorn>=0.24
python-multipart>=0.0.6
numpy>=1.24
scipy>=1.10
scikit-learn>=1.3
llama-cpp-python>=0.2.50
```

**Step 2: Create hf-proxy/pyproject.toml**

```toml
[project]
name = "sovereign-dashboard-backend"
version = "2.0.0"
requires-python = ">=3.10"
dependencies = [
    "fastapi>=0.104",
    "uvicorn>=0.24",
    "python-multipart>=0.0.6",
    "numpy>=1.24",
    "scipy>=1.10",
    "scikit-learn>=1.3",
]

[project.optional-dependencies]
llm = ["llama-cpp-python>=0.2.50"]
dev = ["pytest>=7.0", "httpx>=0.25", "pytest-asyncio>=0.23"]
all = ["sovereign-dashboard-backend[llm,dev]"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

**Step 3: Write the failing test for LLM Manager**

Create `hf-proxy/tests/__init__.py` (empty).

Create `hf-proxy/tests/test_llm_manager.py`:

```python
"""Tests for dual-model LLM manager."""
import pytest
from unittest.mock import MagicMock, patch

from llm_manager import LLMManager, LLMStatus, ModelSlot


class TestLLMManagerInit:
    def test_creates_with_defaults(self):
        mgr = LLMManager()
        assert mgr.gpu_slot is None
        assert mgr.cpu_slot is None

    def test_status_returns_no_models(self):
        mgr = LLMManager()
        status = mgr.status()
        assert status.gpu_model is None
        assert status.cpu_model is None
        assert status.gpu_vram_used_bytes == 0


class TestModelSlot:
    def test_slot_fields(self):
        slot = ModelSlot(
            model_path="/models/test.gguf",
            model_name="test-7b",
            backend="gpu",
            n_ctx=2048,
        )
        assert slot.model_name == "test-7b"
        assert slot.backend == "gpu"


class TestLLMStatus:
    def test_status_fields(self):
        status = LLMStatus(
            gpu_model=None,
            cpu_model=None,
            gpu_vram_used_bytes=0,
            cpu_ram_used_bytes=0,
        )
        assert not status.gpu_loaded
        assert not status.cpu_loaded


class TestInference:
    def test_infer_gpu_raises_when_no_model(self):
        mgr = LLMManager()
        with pytest.raises(RuntimeError, match="No GPU model loaded"):
            mgr.infer_gpu("test prompt")

    def test_infer_cpu_raises_when_no_model(self):
        mgr = LLMManager()
        with pytest.raises(RuntimeError, match="No CPU model loaded"):
            mgr.infer_cpu("test prompt")
```

**Step 4: Run test to verify it fails**

Run: `cd "C:/Claude/New folder/IntelAction_PanelZ/hf-proxy" && python -m pytest tests/test_llm_manager.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'llm_manager'`

**Step 5: Write minimal LLM Manager implementation**

Create `hf-proxy/llm_manager.py`:

```python
"""Dual-model LLM manager — GPU for real-time, CPU for batch."""
from __future__ import annotations

import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ModelSlot:
    model_path: str
    model_name: str
    backend: str  # "gpu" or "cpu"
    n_ctx: int = 2048
    instance: Any = field(default=None, repr=False)


@dataclass
class LLMStatus:
    gpu_model: str | None
    cpu_model: str | None
    gpu_vram_used_bytes: int
    cpu_ram_used_bytes: int

    @property
    def gpu_loaded(self) -> bool:
        return self.gpu_model is not None

    @property
    def cpu_loaded(self) -> bool:
        return self.cpu_model is not None


class LLMManager:
    """Manages two model slots: GPU (always warm) and CPU (on demand).

    GPU slot: small model for classification, analysis, embedding (<100ms).
    CPU slot: large model for coaching, distillation, deep analysis (2-5s).
    """

    def __init__(self) -> None:
        self.gpu_slot: ModelSlot | None = None
        self.cpu_slot: ModelSlot | None = None
        self._gpu_lock = threading.Lock()
        self._cpu_lock = threading.Lock()

    def status(self) -> LLMStatus:
        return LLMStatus(
            gpu_model=self.gpu_slot.model_name if self.gpu_slot else None,
            cpu_model=self.cpu_slot.model_name if self.cpu_slot else None,
            gpu_vram_used_bytes=0,  # TODO: query actual VRAM via nvidia-smi
            cpu_ram_used_bytes=0,
        )

    def load_gpu(self, model_path: str, model_name: str, n_ctx: int = 2048) -> None:
        """Load a GGUF model onto GPU. Unloads existing model first."""
        with self._gpu_lock:
            if self.gpu_slot and self.gpu_slot.instance:
                del self.gpu_slot.instance
            try:
                from llama_cpp import Llama
                instance = Llama(
                    model_path=model_path,
                    n_ctx=n_ctx,
                    n_gpu_layers=-1,  # all layers on GPU
                    verbose=False,
                )
            except ImportError:
                instance = None  # graceful degradation without llama-cpp
            self.gpu_slot = ModelSlot(
                model_path=model_path,
                model_name=model_name,
                backend="gpu",
                n_ctx=n_ctx,
                instance=instance,
            )

    def load_cpu(self, model_path: str, model_name: str, n_ctx: int = 4096) -> None:
        """Load a GGUF model onto CPU. Unloads existing model first."""
        with self._cpu_lock:
            if self.cpu_slot and self.cpu_slot.instance:
                del self.cpu_slot.instance
            try:
                from llama_cpp import Llama
                instance = Llama(
                    model_path=model_path,
                    n_ctx=n_ctx,
                    n_gpu_layers=0,  # all layers on CPU
                    verbose=False,
                )
            except ImportError:
                instance = None
            self.cpu_slot = ModelSlot(
                model_path=model_path,
                model_name=model_name,
                backend="cpu",
                n_ctx=n_ctx,
                instance=instance,
            )

    def unload_gpu(self) -> None:
        with self._gpu_lock:
            if self.gpu_slot and self.gpu_slot.instance:
                del self.gpu_slot.instance
            self.gpu_slot = None

    def unload_cpu(self) -> None:
        with self._cpu_lock:
            if self.cpu_slot and self.cpu_slot.instance:
                del self.cpu_slot.instance
            self.cpu_slot = None

    def infer_gpu(self, prompt: str, max_tokens: int = 256) -> str:
        """Run inference on GPU-resident model. Fast path."""
        if not self.gpu_slot:
            raise RuntimeError("No GPU model loaded")
        with self._gpu_lock:
            if not self.gpu_slot.instance:
                return "(GPU model not available — llama-cpp not installed)"
            result = self.gpu_slot.instance(prompt, max_tokens=max_tokens)
            return result["choices"][0]["text"]

    def infer_cpu(self, prompt: str, max_tokens: int = 1024) -> str:
        """Run inference on CPU-resident model. Batch path."""
        if not self.cpu_slot:
            raise RuntimeError("No CPU model loaded")
        with self._cpu_lock:
            if not self.cpu_slot.instance:
                return "(CPU model not available — llama-cpp not installed)"
            result = self.cpu_slot.instance(prompt, max_tokens=max_tokens)
            return result["choices"][0]["text"]
```

**Step 6: Run tests to verify they pass**

Run: `cd "C:/Claude/New folder/IntelAction_PanelZ/hf-proxy" && python -m pytest tests/test_llm_manager.py -v`
Expected: All 6 tests PASS

**Step 7: Commit**

```bash
git add hf-proxy/requirements.txt hf-proxy/pyproject.toml hf-proxy/llm_manager.py hf-proxy/tests/
git commit -m "feat: add LLM manager with dual GPU/CPU model slots"
```

---

## Task 3: FastAPI Middle Layer — Rewrite app.py

**Files:**
- Modify: `hf-proxy/app.py` (full rewrite)
- Create: `hf-proxy/tests/test_api.py`
- Create: `hf-proxy/swing_store.py`

**Step 1: Write the swing store module**

Create `hf-proxy/swing_store.py`:

```python
"""File-based swing data store."""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any


@dataclass
class SwingRecord:
    id: str
    filename: str
    ground_truth: dict[str, float] = field(default_factory=dict)
    features: dict[str, float] | None = None
    topology: dict[str, Any] | None = None
    classification: str | None = None  # CLEAN, NOISY, ANOMALY
    classification_confidence: float = 0.0
    coaching_notes: str | None = None
    status: str = "ingested"  # ingested, featured, encoded, classified, coached

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SwingStore:
    """Manages swing records on disk as JSON files."""

    def __init__(self, base_dir: str = "./swings") -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def save(self, record: SwingRecord) -> str:
        path = self.base_dir / f"{record.id}.json"
        path.write_text(json.dumps(record.to_dict(), indent=2))
        return record.id

    def load(self, swing_id: str) -> SwingRecord | None:
        path = self.base_dir / f"{swing_id}.json"
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        return SwingRecord(**data)

    def list_all(self) -> list[dict[str, Any]]:
        records = []
        for path in sorted(self.base_dir.glob("*.json")):
            data = json.loads(path.read_text())
            records.append({
                "id": data["id"],
                "filename": data["filename"],
                "status": data["status"],
                "classification": data.get("classification"),
            })
        return records

    def update(self, swing_id: str, **kwargs: Any) -> SwingRecord | None:
        record = self.load(swing_id)
        if not record:
            return None
        for key, value in kwargs.items():
            if hasattr(record, key):
                setattr(record, key, value)
        self.save(record)
        return record

    def create_id(self) -> str:
        return str(uuid.uuid4())[:8]
```

**Step 2: Write API tests**

Create `hf-proxy/tests/test_api.py`:

```python
"""Tests for FastAPI middle layer endpoints."""
import pytest
from fastapi.testclient import TestClient

from app import app


@pytest.fixture
def client():
    return TestClient(app)


class TestHealth:
    def test_health_endpoint(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestSwings:
    def test_list_swings_empty(self, client):
        resp = client.get("/api/swings")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_nonexistent_swing(self, client):
        resp = client.get("/api/swing/nonexistent")
        assert resp.status_code == 404


class TestSignals:
    def test_signals_endpoint(self, client):
        resp = client.get("/api/signals")
        assert resp.status_code == 200
        data = resp.json()
        assert "signals" in data
        assert len(data["signals"]) == 20


class TestLLMStatus:
    def test_llm_status(self, client):
        resp = client.get("/api/llm/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "gpu_model" in data
        assert "cpu_model" in data
```

**Step 3: Run tests to verify they fail**

Run: `cd "C:/Claude/New folder/IntelAction_PanelZ/hf-proxy" && python -m pytest tests/test_api.py -v`
Expected: FAIL — app.py still has old geopolitical code

**Step 4: Rewrite hf-proxy/app.py**

```python
"""Sovereign Motion Dashboard — FastAPI middle layer.

Hot path: direct sovereign-lib imports for features, topology, classification.
Cold path: CLI subprocess for agent loop, curriculum, model registry.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from llm_manager import LLMManager
from swing_store import SwingStore, SwingRecord

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Sovereign Motion Dashboard")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SOVEREIGN_LIB = Path(os.getenv("SOVEREIGN_LIB", r"C:\Claude\New folder\sovereign-lib"))
DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
SWINGS_DIR = DATA_DIR / "swings"
MODELS_DIR = DATA_DIR / "models"
BASELINES_DIR = DATA_DIR / "baselines"

store = SwingStore(str(SWINGS_DIR))
llm = LLMManager()

# ---------------------------------------------------------------------------
# Hot path: sovereign-lib direct imports (lazy — fail gracefully if missing)
# ---------------------------------------------------------------------------
_sovereign_available = False
try:
    sys.path.insert(0, str(SOVEREIGN_LIB))
    from sovereign_motion.sensors.datatypes import IMUTimeSeries
    from sovereign_motion.features.imu_features import extract_imu_features
    from sovereign_motion.transform.phase_detector import GolfPhaseDetector
    from sovereign_topo.signature import encode_motion
    _sovereign_available = True
except ImportError:
    _sovereign_available = False

# ---------------------------------------------------------------------------
# Signal definitions (20 motion quality signals)
# ---------------------------------------------------------------------------
SIGNALS = [
    # IMU Health
    {"id": "sample_rate", "label": "Sample Rate Consistency", "category": "imu", "value": "—", "severity": "unknown"},
    {"id": "axis_saturation", "label": "Axis Saturation", "category": "imu", "value": "—", "severity": "unknown"},
    {"id": "noise_floor", "label": "Noise Floor", "category": "imu", "value": "—", "severity": "unknown"},
    {"id": "drift", "label": "Sensor Drift", "category": "imu", "value": "—", "severity": "unknown"},
    # Feature Pipeline
    {"id": "feature_completeness", "label": "Feature Completeness", "category": "features", "value": "—", "severity": "unknown"},
    {"id": "phase_confidence", "label": "Phase Detection Confidence", "category": "features", "value": "—", "severity": "unknown"},
    {"id": "kinematic_integrity", "label": "Kinematic Chain Integrity", "category": "features", "value": "—", "severity": "unknown"},
    {"id": "impact_detection", "label": "Impact Detection", "category": "features", "value": "—", "severity": "unknown"},
    # Topology Engine
    {"id": "h0_status", "label": "H0 Components", "category": "topology", "value": "—", "severity": "unknown"},
    {"id": "h1_status", "label": "H1 Loops", "category": "topology", "value": "—", "severity": "unknown"},
    {"id": "persistence_lifetime", "label": "Persistence Lifetime", "category": "topology", "value": "—", "severity": "unknown"},
    {"id": "sheaf_coherence", "label": "Sheaf Coherence", "category": "topology", "value": "—", "severity": "unknown"},
    # LLM Status
    {"id": "gpu_model_status", "label": "GPU Model", "category": "llm", "value": "—", "severity": "unknown"},
    {"id": "cpu_model_status", "label": "CPU Model", "category": "llm", "value": "—", "severity": "unknown"},
    {"id": "gpu_vram", "label": "VRAM Usage", "category": "llm", "value": "—", "severity": "unknown"},
    {"id": "inference_latency", "label": "Inference Latency", "category": "llm", "value": "—", "severity": "unknown"},
    # Data Inventory
    {"id": "swings_ingested", "label": "Swings Ingested", "category": "data", "value": "0", "severity": "unknown"},
    {"id": "ground_truth_coverage", "label": "Ground Truth Coverage", "category": "data", "value": "—", "severity": "unknown"},
    {"id": "baseline_count", "label": "Baselines", "category": "data", "value": "0", "severity": "unknown"},
    {"id": "unprocessed_queue", "label": "Unprocessed Queue", "category": "data", "value": "0", "severity": "unknown"},
]

CATEGORY_META = {
    "imu": {"label": "IMU Health", "color": "#e04040"},
    "features": {"label": "Feature Pipeline", "color": "#e08840"},
    "topology": {"label": "Topology Engine", "color": "#9070d0"},
    "llm": {"label": "LLM Status", "color": "#4a8fd4"},
    "data": {"label": "Data Inventory", "color": "#3dba6f"},
}

# ---------------------------------------------------------------------------
# Classification keywords (CLEAN / NOISY / ANOMALY)
# ---------------------------------------------------------------------------
CLEAN_KEYWORDS = [
    "address", "backswing", "top", "downswing", "impact", "follow", "finish",
    "persistent", "stable", "coherent", "converged", "consistent",
    "calibrated", "synchronized", "complete", "valid", "within-range",
    "extracted", "resolved", "detected", "matched", "baseline-aligned",
    "phase", "transition", "acceleration", "peak", "velocity",
]

NOISY_KEYWORDS = [
    "saturated", "clipped", "dropout", "drift", "desync", "interpolated",
    "ambiguous", "overlap", "missed", "uncertain", "low-confidence",
    "degenerate", "unstable", "divergent", "sparse", "insufficient",
    "missing", "partial", "corrupted", "outlier", "rejected",
    "error", "failed", "timeout", "overflow", "underflow",
]


def classify_text(text: str) -> dict:
    """Classify text as CLEAN, NOISY, or MIXED using keyword scoring."""
    text_lower = text.lower()
    clean_hits = sum(1 for kw in CLEAN_KEYWORDS if kw in text_lower)
    noisy_hits = sum(1 for kw in NOISY_KEYWORDS if kw in text_lower)
    total = clean_hits + noisy_hits
    if total == 0:
        return {"classification": "MIXED", "confidence": 0, "clean_hits": 0, "noisy_hits": 0}
    score = (clean_hits - noisy_hits) / total
    if score > 0.15:
        cls = "CLEAN"
    elif score < -0.15:
        cls = "NOISY"
    else:
        cls = "MIXED"
    confidence = min(100, (total / 8) * 100)
    return {"classification": cls, "confidence": round(confidence), "clean_hits": clean_hits, "noisy_hits": noisy_hits}


# ---------------------------------------------------------------------------
# Cold path helper: run sovereign CLI commands
# ---------------------------------------------------------------------------
def run_sovereign_cli(args: list[str], timeout: int = 300) -> dict:
    """Execute a sovereign CLI command and return parsed output."""
    cmd = [sys.executable, "-m", "sovereign_cli.main"] + args
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            cwd=str(SOVEREIGN_LIB),
        )
        return {"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode}
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out", "returncode": -1}
    except FileNotFoundError:
        return {"stdout": "", "stderr": "sovereign CLI not found", "returncode": -1}


# ---------------------------------------------------------------------------
# API Endpoints — Shared
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "sovereign_lib": _sovereign_available,
        "gpu_model": llm.status().gpu_model,
        "cpu_model": llm.status().cpu_model,
    }


# ---------------------------------------------------------------------------
# API Endpoints — Hot Path
# ---------------------------------------------------------------------------
@app.post("/api/ingest")
async def ingest(file: UploadFile = File(...), ground_truth: str = "{}"):
    """Upload a swing CSV + optional ground truth JSON."""
    swing_id = store.create_id()
    content = await file.read()
    csv_path = SWINGS_DIR / f"{swing_id}.csv"
    SWINGS_DIR.mkdir(parents=True, exist_ok=True)
    csv_path.write_bytes(content)
    gt = json.loads(ground_truth) if ground_truth else {}
    record = SwingRecord(
        id=swing_id,
        filename=file.filename or "unknown.csv",
        ground_truth=gt,
        status="ingested",
    )
    store.save(record)
    return {"id": swing_id, "status": "ingested", "filename": record.filename}


@app.post("/api/features/{swing_id}")
async def extract_features(swing_id: str):
    """Extract 90 features for a swing using sovereign_motion (hot path)."""
    record = store.load(swing_id)
    if not record:
        raise HTTPException(404, f"Swing {swing_id} not found")
    if not _sovereign_available:
        raise HTTPException(503, "sovereign-lib not available")

    csv_path = SWINGS_DIR / f"{swing_id}.csv"
    if not csv_path.exists():
        raise HTTPException(404, f"CSV file for {swing_id} not found")

    # Parse CSV into IMUTimeSeries
    data = np.genfromtxt(str(csv_path), delimiter=",", skip_header=1)
    time_s = data[:, 0]
    accel = IMUTimeSeries(time_s=time_s, x=data[:, 1], y=data[:, 2], z=data[:, 3], source="accel")
    gyro = IMUTimeSeries(time_s=time_s, x=data[:, 4], y=data[:, 5], z=data[:, 6], source="gyro")

    # Detect phases to find impact
    detector = GolfPhaseDetector()
    phases = detector.detect(gyro, accel)
    impact_idx = phases.phase_index("impact")

    # Extract features
    features = extract_imu_features(gyro, accel, impact_idx)
    store.update(swing_id, features=features, status="featured")
    return {"id": swing_id, "status": "featured", "feature_count": len(features), "features": features}


@app.post("/api/encode/{swing_id}")
async def encode_topology(swing_id: str):
    """Compute TopologicalMotionSignature for a swing (hot path)."""
    record = store.load(swing_id)
    if not record:
        raise HTTPException(404, f"Swing {swing_id} not found")
    if not _sovereign_available:
        raise HTTPException(503, "sovereign-lib not available")
    if not record.features:
        raise HTTPException(400, "Features not extracted yet — call /api/features first")

    csv_path = SWINGS_DIR / f"{swing_id}.csv"
    data = np.genfromtxt(str(csv_path), delimiter=",", skip_header=1)
    time_s = data[:, 0]
    accel = IMUTimeSeries(time_s=time_s, x=data[:, 1], y=data[:, 2], z=data[:, 3], source="accel")
    gyro = IMUTimeSeries(time_s=time_s, x=data[:, 4], y=data[:, 5], z=data[:, 6], source="gyro")

    segments = {"accel": accel.xyz, "gyro": gyro.xyz}
    edges = [("accel", "gyro")]
    sig = encode_motion(segments, edges)

    topology = {
        "persistence": {
            "pairs": [{"birth": p.birth, "death": p.death, "dimension": p.dimension}
                      for p in sig.persistence.pairs],
            "total_persistence": sig.persistence.total_persistence,
            "betti_0": sig.persistence.betti_0,
            "betti_1": sig.persistence.betti_1,
        },
        "sheaf": {
            "edges": list(sig.sheaf.edge_scores.keys()) if hasattr(sig.sheaf, 'edge_scores') else [],
            "global_coherence": getattr(sig.sheaf, 'global_coherence', 0.0),
        },
        "cst_report": {
            "n_discontinuities": getattr(sig.cst_report, 'n_discontinuities', 0),
        },
    }
    store.update(swing_id, topology=topology, status="encoded")
    return {"id": swing_id, "status": "encoded", "topology": topology}


@app.post("/api/classify/{swing_id}")
async def classify_swing(swing_id: str):
    """Classify swing signal quality via GPU LLM (hot path)."""
    record = store.load(swing_id)
    if not record:
        raise HTTPException(404, f"Swing {swing_id} not found")

    # Build summary text for classification
    parts = [f"Swing {swing_id} from {record.filename}"]
    if record.features:
        parts.append(f"Features extracted: {len(record.features)}")
    if record.topology:
        parts.append(f"Betti-0: {record.topology.get('persistence', {}).get('betti_0', '?')}")
        parts.append(f"Total persistence: {record.topology.get('persistence', {}).get('total_persistence', '?')}")
    summary = ". ".join(parts)

    # Try GPU LLM first, fall back to keyword classifier
    status = llm.status()
    if status.gpu_loaded:
        prompt = f"Classify this motion data quality as CLEAN, NOISY, or ANOMALY. Respond with just the classification and confidence 0-100.\n\nData: {summary}"
        try:
            result = llm.infer_gpu(prompt, max_tokens=32)
            classification = "CLEAN" if "CLEAN" in result.upper() else "NOISY" if "NOISY" in result.upper() else "MIXED"
            confidence = 85  # LLM classification default confidence
        except Exception:
            cls_result = classify_text(summary)
            classification = cls_result["classification"]
            confidence = cls_result["confidence"]
    else:
        cls_result = classify_text(summary)
        classification = cls_result["classification"]
        confidence = cls_result["confidence"]

    store.update(swing_id, classification=classification, classification_confidence=confidence, status="classified")
    return {"id": swing_id, "classification": classification, "confidence": confidence}


@app.post("/api/analyze/{swing_id}")
async def full_pipeline(swing_id: str):
    """Run full pipeline: features -> encode -> classify (hot path)."""
    record = store.load(swing_id)
    if not record:
        raise HTTPException(404, f"Swing {swing_id} not found")

    results = {}
    if record.status == "ingested" and _sovereign_available:
        feat_result = await extract_features(swing_id)
        results["features"] = feat_result
    record = store.load(swing_id)
    if record and record.status == "featured" and _sovereign_available:
        topo_result = await encode_topology(swing_id)
        results["topology"] = topo_result
    record = store.load(swing_id)
    if record and record.status == "encoded":
        cls_result = await classify_swing(swing_id)
        results["classification"] = cls_result
    record = store.load(swing_id)
    return {"id": swing_id, "status": record.status if record else "unknown", "results": results}


@app.post("/api/batch")
async def batch_process(files: list[UploadFile] = File(...)):
    """Process multiple swings in one call."""
    results = []
    for file in files:
        ingest_result = await ingest(file)
        swing_id = ingest_result["id"]
        try:
            pipeline_result = await full_pipeline(swing_id)
            results.append(pipeline_result)
        except Exception as e:
            results.append({"id": swing_id, "error": str(e)})
    return results


@app.get("/api/swings")
async def list_swings():
    return store.list_all()


@app.get("/api/swing/{swing_id}")
async def get_swing(swing_id: str):
    record = store.load(swing_id)
    if not record:
        raise HTTPException(404, f"Swing {swing_id} not found")
    return record.to_dict()


@app.get("/api/baselines")
async def list_baselines():
    baselines_store = SwingStore(str(BASELINES_DIR))
    return baselines_store.list_all()


@app.get("/api/signals")
async def get_signals():
    """Return current 20-signal health monitor state."""
    signals = list(SIGNALS)  # copy
    # Update data inventory signals dynamically
    all_swings = store.list_all()
    for sig in signals:
        if sig["id"] == "swings_ingested":
            sig["value"] = str(len(all_swings))
            sig["severity"] = "green" if len(all_swings) > 0 else "unknown"
        elif sig["id"] == "ground_truth_coverage":
            with_gt = sum(1 for s in all_swings if store.load(s["id"]) and store.load(s["id"]).ground_truth)
            sig["value"] = f"{with_gt}/{len(all_swings)}" if all_swings else "—"
            sig["severity"] = "green" if all_swings and with_gt == len(all_swings) else "yellow" if with_gt > 0 else "unknown"
        elif sig["id"] == "unprocessed_queue":
            unprocessed = sum(1 for s in all_swings if s.get("status") == "ingested")
            sig["value"] = str(unprocessed)
            sig["severity"] = "green" if unprocessed == 0 else "yellow" if unprocessed < 5 else "red"
        elif sig["id"] == "gpu_model_status":
            status = llm.status()
            sig["value"] = status.gpu_model or "Not loaded"
            sig["severity"] = "green" if status.gpu_loaded else "red"
        elif sig["id"] == "cpu_model_status":
            status = llm.status()
            sig["value"] = status.cpu_model or "Not loaded"
            sig["severity"] = "green" if status.cpu_loaded else "yellow"
    return {"signals": signals, "categories": CATEGORY_META}


@app.get("/api/llm/status")
async def get_llm_status():
    status = llm.status()
    return {
        "gpu_model": status.gpu_model,
        "cpu_model": status.cpu_model,
        "gpu_vram_used_bytes": status.gpu_vram_used_bytes,
        "cpu_ram_used_bytes": status.cpu_ram_used_bytes,
        "gpu_loaded": status.gpu_loaded,
        "cpu_loaded": status.cpu_loaded,
    }


# ---------------------------------------------------------------------------
# API Endpoints — Cold Path (CLI orchestration)
# ---------------------------------------------------------------------------
@app.post("/api/coach/{swing_id}")
async def coach_swing(swing_id: str):
    """Generate coaching insights via CPU LLM (cold path)."""
    record = store.load(swing_id)
    if not record:
        raise HTTPException(404, f"Swing {swing_id} not found")
    status = llm.status()
    if not status.cpu_loaded:
        raise HTTPException(503, "CPU model not loaded — load a model first via /api/models/swap")

    prompt = f"""Analyze this golf swing and provide coaching insights.

Swing ID: {swing_id}
Ground Truth: {json.dumps(record.ground_truth, indent=2)}
Features: {json.dumps(record.features, indent=2) if record.features else 'Not extracted'}
Topology: {json.dumps(record.topology, indent=2) if record.topology else 'Not encoded'}
Classification: {record.classification or 'Not classified'}

Provide 3-5 specific, actionable coaching insights based on the data."""

    notes = llm.infer_cpu(prompt, max_tokens=1024)
    store.update(swing_id, coaching_notes=notes, status="coached")
    return {"id": swing_id, "coaching_notes": notes}


@app.get("/api/agent/plan")
async def agent_plan():
    """Run sovereign agent planner (cold path)."""
    result = run_sovereign_cli(["agent", "plan"])
    return result


@app.get("/api/agent/dashboard")
async def agent_dashboard():
    """Get model registry state (cold path)."""
    result = run_sovereign_cli(["agent", "dashboard"])
    return result


@app.post("/api/agent/loop")
async def agent_loop(max_cycles: int = 3):
    """Trigger autonomous improvement cycle (cold path)."""
    result = run_sovereign_cli(["agent", "loop", "--max-cycles", str(max_cycles)])
    return result


@app.post("/api/distill")
async def distill():
    """Kick off IOA distillation run (cold path)."""
    result = run_sovereign_cli(["ioa", "curriculum", "--n-gaps", "5"])
    return result


@app.post("/api/curriculum")
async def generate_curriculum():
    """Generate training curriculum (cold path)."""
    result = run_sovereign_cli(["ioa", "curriculum"])
    return result


@app.get("/api/models")
async def list_models():
    """List available GGUF models."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    models = []
    for path in MODELS_DIR.glob("*.gguf"):
        models.append({
            "name": path.stem,
            "path": str(path),
            "size_bytes": path.stat().st_size,
        })
    return models


@app.post("/api/models/swap")
async def swap_model(slot: str, model_path: str, model_name: str):
    """Hot-swap a model on GPU or CPU slot."""
    if slot == "gpu":
        llm.load_gpu(model_path, model_name)
    elif slot == "cpu":
        llm.load_cpu(model_path, model_name)
    else:
        raise HTTPException(400, f"Invalid slot: {slot}. Use 'gpu' or 'cpu'.")
    return {"status": "loaded", "slot": slot, "model": model_name}


@app.get("/api/compare")
async def compare_swings(a: str, b: str):
    """Compare two swings topologically."""
    rec_a = store.load(a)
    rec_b = store.load(b)
    if not rec_a:
        raise HTTPException(404, f"Swing {a} not found")
    if not rec_b:
        raise HTTPException(404, f"Swing {b} not found")
    if not rec_a.topology or not rec_b.topology:
        raise HTTPException(400, "Both swings must be encoded first")

    pers_a = rec_a.topology.get("persistence", {})
    pers_b = rec_b.topology.get("persistence", {})
    return {
        "swing_a": {"id": a, "betti_0": pers_a.get("betti_0"), "total_persistence": pers_a.get("total_persistence")},
        "swing_b": {"id": b, "betti_0": pers_b.get("betti_0"), "total_persistence": pers_b.get("total_persistence")},
        "delta_persistence": abs((pers_a.get("total_persistence") or 0) - (pers_b.get("total_persistence") or 0)),
    }


# ---------------------------------------------------------------------------
# Static frontend serving (production)
# ---------------------------------------------------------------------------
STATIC_DIR = Path(__file__).parent.parent / "dist"
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "7860"))
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SWINGS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    BASELINES_DIR.mkdir(parents=True, exist_ok=True)
    uvicorn.run(app, host="0.0.0.0", port=port)
```

**Step 5: Run tests to verify they pass**

Run: `cd "C:/Claude/New folder/IntelAction_PanelZ/hf-proxy" && python -m pytest tests/test_api.py -v`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add hf-proxy/app.py hf-proxy/swing_store.py hf-proxy/tests/test_api.py
git commit -m "feat: rewrite FastAPI backend for motion intelligence pipeline"
```

---

## Task 4: DataService.jsx — Rewrite for Motion Endpoints

**Files:**
- Modify: `src/DataService.jsx` (full rewrite)

**Step 1: Rewrite DataService.jsx**

```jsx
/**
 * DataService — fetches motion intelligence data from FastAPI backend.
 * Preserves caching and fallback patterns from original dashboard.
 */

const API_BASE = '';  // same-origin via Vite proxy in dev, co-deployed in prod

// ---------------------------------------------------------------------------
// Cache layer (preserved pattern)
// ---------------------------------------------------------------------------
const cache = new Map();

function getCached(key, ttlMs) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// ---------------------------------------------------------------------------
// Classification keywords — CLEAN / NOISY (preserved algorithm, new vocabulary)
// ---------------------------------------------------------------------------
const CLEAN_KEYWORDS = [
  'address', 'backswing', 'top', 'downswing', 'impact', 'follow', 'finish',
  'persistent', 'stable', 'coherent', 'converged', 'consistent',
  'calibrated', 'synchronized', 'complete', 'valid', 'within-range',
  'extracted', 'resolved', 'detected', 'matched', 'baseline-aligned',
  'phase', 'transition', 'acceleration', 'peak', 'velocity',
];

const NOISY_KEYWORDS = [
  'saturated', 'clipped', 'dropout', 'drift', 'desync', 'interpolated',
  'ambiguous', 'overlap', 'missed', 'uncertain', 'low-confidence',
  'degenerate', 'unstable', 'divergent', 'sparse', 'insufficient',
  'missing', 'partial', 'corrupted', 'outlier', 'rejected',
  'error', 'failed', 'timeout', 'overflow', 'underflow',
];

export function classifyText(text) {
  const lower = text.toLowerCase();
  const cleanHits = CLEAN_KEYWORDS.filter(kw => lower.includes(kw)).length;
  const noisyHits = NOISY_KEYWORDS.filter(kw => lower.includes(kw)).length;
  const total = cleanHits + noisyHits;
  if (total === 0) return { classification: 'MIXED', confidence: 0, cleanHits: 0, noisyHits: 0 };
  const score = (cleanHits - noisyHits) / total;
  const classification = score > 0.15 ? 'CLEAN' : score < -0.15 ? 'NOISY' : 'MIXED';
  const confidence = Math.min(100, Math.round((total / 8) * 100));
  return { classification, confidence, cleanHits, noisyHits };
}

// ---------------------------------------------------------------------------
// Topology chain mapping
// ---------------------------------------------------------------------------
export const CHAIN_TERMS = {
  imu_integrity: ['sample', 'rate', 'drift', 'noise', 'calibrat', 'saturat', 'sensor'],
  kinematic: ['phase', 'segment', 'backswing', 'downswing', 'impact', 'address', 'finish'],
  persistence: ['betti', 'homology', 'persistence', 'birth', 'death', 'diagram', 'point cloud'],
  sheaf_coherence: ['sheaf', 'coherence', 'fiber', 'restriction', 'bundle', 'joint'],
  llm_confidence: ['embedding', 'classification', 'confidence', 'inference', 'model', 'token'],
};

// ---------------------------------------------------------------------------
// API fetchers
// ---------------------------------------------------------------------------
export async function fetchSwings() {
  const cached = getCached('swings', 30_000);
  if (cached) return cached;
  try {
    const resp = await fetch(`${API_BASE}/api/swings`);
    const data = await resp.json();
    setCache('swings', data);
    return data;
  } catch (e) {
    console.error('fetchSwings failed:', e);
    return [];
  }
}

export async function fetchSwing(id) {
  const cached = getCached(`swing-${id}`, 0); // permanent cache for full records
  if (cached) return cached;
  try {
    const resp = await fetch(`${API_BASE}/api/swing/${id}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    setCache(`swing-${id}`, data);
    return data;
  } catch (e) {
    console.error(`fetchSwing ${id} failed:`, e);
    return null;
  }
}

export async function fetchSignals() {
  const cached = getCached('signals', 5_000);
  if (cached) return cached;
  try {
    const resp = await fetch(`${API_BASE}/api/signals`);
    const data = await resp.json();
    setCache('signals', data);
    return data;
  } catch (e) {
    console.error('fetchSignals failed:', e);
    return { signals: [], categories: {} };
  }
}

export async function fetchLLMStatus() {
  try {
    const resp = await fetch(`${API_BASE}/api/llm/status`);
    return await resp.json();
  } catch (e) {
    console.error('fetchLLMStatus failed:', e);
    return { gpu_model: null, cpu_model: null, gpu_loaded: false, cpu_loaded: false };
  }
}

export async function fetchModels() {
  try {
    const resp = await fetch(`${API_BASE}/api/models`);
    return await resp.json();
  } catch (e) {
    console.error('fetchModels failed:', e);
    return [];
  }
}

export async function fetchBaselines() {
  const cached = getCached('baselines', 30_000);
  if (cached) return cached;
  try {
    const resp = await fetch(`${API_BASE}/api/baselines`);
    const data = await resp.json();
    setCache('baselines', data);
    return data;
  } catch (e) {
    return [];
  }
}

export async function ingestSwing(file, groundTruth = {}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('ground_truth', JSON.stringify(groundTruth));
  const resp = await fetch(`${API_BASE}/api/ingest`, { method: 'POST', body: formData });
  cache.delete('swings'); // invalidate
  return await resp.json();
}

export async function analyzeSwing(id) {
  const resp = await fetch(`${API_BASE}/api/analyze/${id}`, { method: 'POST' });
  cache.delete(`swing-${id}`);
  cache.delete('swings');
  return await resp.json();
}

export async function coachSwing(id) {
  const resp = await fetch(`${API_BASE}/api/coach/${id}`, { method: 'POST' });
  cache.delete(`swing-${id}`);
  return await resp.json();
}

export async function compareSwings(a, b) {
  const resp = await fetch(`${API_BASE}/api/compare?a=${a}&b=${b}`);
  return await resp.json();
}

export async function swapModel(slot, modelPath, modelName) {
  const resp = await fetch(`${API_BASE}/api/models/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot, model_path: modelPath, model_name: modelName }),
  });
  return await resp.json();
}

export async function fetchAgentPlan() {
  const resp = await fetch(`${API_BASE}/api/agent/plan`);
  return await resp.json();
}

export async function fetchAgentDashboard() {
  const resp = await fetch(`${API_BASE}/api/agent/dashboard`);
  return await resp.json();
}

export async function triggerDistill() {
  const resp = await fetch(`${API_BASE}/api/distill`, { method: 'POST' });
  return await resp.json();
}

export async function triggerAgentLoop(maxCycles = 3) {
  const resp = await fetch(`${API_BASE}/api/agent/loop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_cycles: maxCycles }),
  });
  return await resp.json();
}
```

**Step 2: Commit**

```bash
git add src/DataService.jsx
git commit -m "feat: rewrite DataService for motion intelligence API"
```

---

## Task 5: Theme Update — Add Topology Colors

**Files:**
- Modify: `src/theme.js`

**Step 1: Update theme.js**

```js
export const COLORS = {
  bg: '#0a0c10',
  surface: '#12151c',
  surfaceHover: '#1a1e28',
  border: '#1e2330',
  borderActive: '#d4a843',
  gold: '#d4a843',
  goldDim: '#8a6e2f',
  goldBright: '#f0c95a',
  red: '#e04040',
  redDim: '#8b2020',
  green: '#3dba6f',
  greenDim: '#1d6b3a',
  blue: '#4a8fd4',
  blueDim: '#2a5580',
  text: '#e8e4dc',
  textDim: '#8a8678',
  textMuted: '#5a5850',
  orange: '#e08840',
  purple: '#9070d0',
  // Category colors (matching CATEGORY_META in backend)
  catImu: '#e04040',
  catFeatures: '#e08840',
  catTopology: '#9070d0',
  catLlm: '#4a8fd4',
  catData: '#3dba6f',
};

export const CATEGORY_COLORS = {
  imu: COLORS.catImu,
  features: COLORS.catFeatures,
  topology: COLORS.catTopology,
  llm: COLORS.catLlm,
  data: COLORS.catData,
};

export const CLASS_COLORS = {
  CLEAN: COLORS.green,
  NOISY: COLORS.red,
  MIXED: COLORS.orange,
  ANOMALY: COLORS.purple,
};
```

**Step 2: Commit**

```bash
git add src/theme.js
git commit -m "feat: add topology and category colors to theme"
```

---

## Task 6: App.jsx Shell — Update Navigation and Tab Structure

**Files:**
- Modify: `src/App.jsx` (update header, tab names, imports — preserve structure)

**Step 1: Update tab definitions and header in App.jsx**

Replace lines 1-200 (imports, constants, Header) with motion intelligence equivalents. The key changes:

- Tab names: `thesis`, `nodes` -> `sensors`, `patterns` -> `motionPatterns`, `portfolio` -> `modelRegistry`, `playbook` -> `topoChains`, `monitor`, `feed`
- Tab labels: "THE THESIS", "SENSOR NODES", "MOTION PATTERNS", "MODEL REGISTRY", "TOPOLOGY CHAINS", "SIGNAL MONITOR", "SESSION FEED"
- Remove `VERIFY_SOURCES` for geopolitical sources
- Update imports to use new DataService exports

The individual tab components (ThesisTab, NodesTab/SensorsTab, etc.) are rewritten in Tasks 7-13.

**Step 2: Update the App component** (bottom of file ~line 1592) to render new tab names:

```jsx
function App() {
  const [activeTab, setActiveTab] = useState('thesis');
  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text }}>
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 40px' }}>
        {activeTab === 'thesis' && <ThesisTab />}
        {activeTab === 'sensors' && <SensorNodesTab />}
        {activeTab === 'motionPatterns' && <MotionPatternsTab />}
        {activeTab === 'modelRegistry' && <ModelRegistryTab />}
        {activeTab === 'topoChains' && <TopologyChainsTab />}
        {activeTab === 'monitor' && <SignalMonitorTab />}
        {activeTab === 'feed' && <SessionFeedTab />}
      </div>
    </div>
  );
}
```

**This task sets up the shell.** Each tab component is created in the following tasks. Until all tabs are implemented, stub components return placeholder divs.

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: update App shell with motion intelligence tab structure"
```

---

## Task 7: Tab 1 — ThesisTab (Topological Motion Analysis)

**Files:**
- Modify: `src/App.jsx` — replace ThesisTab component (lines 202-465)

**Step 1: Rewrite ThesisTab**

Replace the geopolitical effects-vs-events thesis with the topological motion analysis thesis. Key sections:

1. **Core Thesis**: "A $50 IMU sensor captures motion patterns that persistent homology encodes into mathematical invariants — structures that raw statistics miss."
2. **Sense -> Encode -> Remember pipeline** explained visually (3 columns)
3. **Why Topology?** — Persistent homology captures shape of motion invariant to speed/timing. Two swings that "feel the same" have matching Betti numbers even if raw accelerometer traces differ.
4. **Phase Transitions in Motion** — Swing phases as topological state changes. Address -> Backswing -> Top -> Downswing -> Impact -> Follow -> Finish. Each transition is a critical point in the persistence diagram.
5. **Signal vs Noise** — CLEAN data has high persistence lifetime and sheaf coherence. NOISY data has degenerate topology and low coherence. The classification engine separates them.

This is a static content tab — no data fetching needed.

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: rewrite ThesisTab for topological motion analysis"
```

---

## Task 8: Tab 2 — SensorNodesTab (Pipeline Health)

**Files:**
- Modify: `src/App.jsx` — replace NodesTab component (lines 468-668)

**Step 1: Rewrite as SensorNodesTab**

Fetches `/api/signals` and renders 5 categories of motion pipeline health. Replaces the 5 geopolitical tracking node categories.

Structure:
- Fetch signals on mount, auto-refresh every 5s
- Render 5 collapsible category sections (IMU Health, Feature Pipeline, Topology Engine, LLM Status, Data Inventory)
- Each signal shows: label, current value, severity badge (green/yellow/red/unknown)
- Category headers show aggregate health (worst severity in category)

Uses `fetchSignals()` from DataService.

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: rewrite SensorNodesTab for motion pipeline health"
```

---

## Task 9: Tab 3 — MotionPatternsTab (Historical Signatures)

**Files:**
- Modify: `src/PatternsTab.jsx` (full rewrite)

**Step 1: Rewrite PatternsTab.jsx as MotionPatternsTab**

Replaces historical conflict-to-price correlations with historical swing signature analysis.

Sections:
1. **Session Overview** — Number of swings analyzed, date range, baseline count
2. **Persistence Diagram Overlay** — Renders birth-death scatter plots for selected swings (SVG, no external lib needed). Each swing is a different color. Diagonal line = zero persistence.
3. **Phase Timing Consistency** — Bar chart showing phase durations across swings. Consistent timing = good technique.
4. **Baseline Comparison** — Table showing deviation from baseline for key metrics (total persistence, betti-0, sheaf coherence, ground truth ball speed, etc.)
5. **Trend Detection** — Simple up/down/flat indicators for topological metrics over last N swings.

Fetches `/api/swings`, then `/api/swing/{id}` for each to get topology data.

**Step 2: Commit**

```bash
git add src/PatternsTab.jsx
git commit -m "feat: rewrite MotionPatternsTab for swing signature analysis"
```

---

## Task 10: Tab 4 — ModelRegistryTab (LLM Inventory)

**Files:**
- Modify: `src/App.jsx` — replace PortfolioTab component (lines 671-887)

**Step 1: Rewrite as ModelRegistryTab**

Replaces oil/gas asset positioning with local LLM inventory and training status.

Sections:
1. **Active Models** — Two cards showing GPU slot and CPU slot. Each shows: model name, quantization, size, backend, inference speed indicator. "Swap" button triggers model swap.
2. **Available Models** — List from `/api/models` showing all GGUF files in models directory. Click to load into GPU or CPU slot.
3. **IOA Curriculum Progress** — Fetched from `/api/agent/dashboard` (cold path). Shows curriculum units with mastery status (NOT_STARTED, IN_PROGRESS, MASTERED, REGRESSED).
4. **Actions** — Buttons: "Start Distillation", "Generate Curriculum", "Run Agent Loop". Each triggers the corresponding cold-path endpoint.

Fetches `/api/llm/status`, `/api/models`, `/api/agent/dashboard`.

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: rewrite ModelRegistryTab for LLM inventory management"
```

---

## Task 11: Tab 5 — TopologyChainsTab (Signature Visualization)

**Files:**
- Modify: `src/App.jsx` — replace PlaybookTab component (lines 890-1143)

**Step 1: Rewrite as TopologyChainsTab**

Replaces geopolitical effect cascades with topological signature visualization.

Sections:
1. **Chain Selector** — Dropdown or tabs for 5 topology chains (IMU Integrity, Kinematic, Persistence, Sheaf Coherence, LLM Confidence). Each shows its cascade flow.
2. **Persistence Diagram** — SVG birth-death plot for selected swing. Points colored by dimension (H0=blue, H1=purple, H2=gold). Hoverable for birth/death values.
3. **Sheaf Coherence Heatmap** — Grid showing per-edge coherence scores. Color scale from red (low) to green (high).
4. **CST Discontinuity Report** — List of detected field discontinuities with locations.
5. **Swing Comparison** — Side-by-side persistence diagrams for two selected swings via `/api/compare`.

Fetches `/api/swings` for swing list, `/api/swing/{id}` for topology data, `/api/compare` for comparison.

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: rewrite TopologyChainsTab for topology visualization"
```

---

## Task 12: Tab 6 — SignalMonitorTab (Motion Quality Signals)

**Files:**
- Modify: `src/App.jsx` — replace SignalMonitorTab component (lines 1147-1589)

**Step 1: Rewrite SignalMonitorTab**

Preserves the structure of 20 signals with severity thresholds but swaps content to motion quality.

Key changes:
- Remove `fetchCommodityPrices` — replaced by `fetchSignals()` from DataService
- Remove commodity price state — replaced by signals state from API
- Remove SIGNALS array (lines 86-107) — signals come from backend now
- Remove SEVERITY_THRESHOLDS (lines 110-120) — thresholds computed server-side
- Keep: coherence score calculation, filter controls, severity color helpers, signal grid layout
- Keep: semantic signal analyzer section — now accepts motion text and classifies as CLEAN/NOISY/MIXED
- Auto-refresh signals every 5s

Sections:
1. **System Status Header** — Shows sovereign-lib availability, GPU/CPU model status, pipeline health aggregate
2. **Coherence Gauge** — Average severity across all 20 signals (same visual, new data)
3. **Filter Controls** — Filter by category (imu, features, topology, llm, data) and severity
4. **Signal Grid** — 20 signals in cards with label, value, severity badge, category color
5. **Semantic Analyzer** — Text input that classifies pasted motion notes as CLEAN/NOISY/MIXED using `classifyText()`

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: rewrite SignalMonitorTab for motion quality signals"
```

---

## Task 13: Tab 7 — SessionFeedTab (Swing-by-Swing Log)

**Files:**
- Modify: `src/LiveFeedTab.jsx` (full rewrite)

**Step 1: Rewrite LiveFeedTab.jsx as SessionFeedTab**

Replaces RSS OSINT feed with swing-by-swing session log.

Key changes:
- Remove RSS fetching — replaced by `fetchSwings()` + `fetchSwing(id)` for details
- Remove feed source rotation — replaced by file upload
- Keep: auto-refresh pattern (30s interval), filter controls, classification badges, expandable items
- Add: file upload area at top for drag-and-drop CSV ingestion
- Add: "Analyze" button per swing to trigger full pipeline
- Add: "Coach" button per swing to trigger CPU LLM coaching

Sections:
1. **Upload Area** — Drag-and-drop or click to upload CSV files. Optional ground truth JSON input.
2. **Session Stats** — Total swings, classified count, average confidence
3. **Filters** — Filter by classification (CLEAN/NOISY/MIXED/ALL), sort by any field
4. **Swing Cards** — Each card shows:
   - Shot number, filename, status badge
   - Classification badge (CLEAN/NOISY/MIXED) with confidence
   - Ground truth metrics (if available): ball speed, launch angle, spin rate
   - Expandable detail: full feature vector, persistence diagram summary, coaching notes
5. **Actions** — "Analyze All" button for batch processing, "Refresh" button

**Step 2: Commit**

```bash
git add src/LiveFeedTab.jsx
git commit -m "feat: rewrite SessionFeedTab for swing-by-swing session log"
```

---

## Task 14: Integration Testing and Cleanup

**Files:**
- Modify: `src/App.jsx` — final import cleanup
- Modify: `src/main.jsx` — no changes expected
- Remove: any dead geopolitical code remaining

**Step 1: Verify all imports resolve**

Check that App.jsx imports:
- `SessionFeedTab` from `./LiveFeedTab.jsx` (or rename file to `SessionFeedTab.jsx`)
- `MotionPatternsTab` from `./PatternsTab.jsx` (or rename file)
- All DataService exports used

**Step 2: Rename files to match new domain (optional but recommended)**

```bash
git mv src/LiveFeedTab.jsx src/SessionFeedTab.jsx
git mv src/PatternsTab.jsx src/MotionPatternsTab.jsx
```

Update imports in App.jsx accordingly.

**Step 3: Remove build_user_Feedback directory** (geopolitical feedback report — no longer relevant)

```bash
git rm -r build_user_Feedback/
```

**Step 4: Run dev server and verify**

```bash
# Terminal 1: Backend
cd hf-proxy && pip install -r requirements.txt && python app.py

# Terminal 2: Frontend
npm install && npm run dev
```

Verify:
- All 7 tabs render without errors
- Signal Monitor fetches from `/api/signals`
- Session Feed shows empty state with upload area
- Health endpoint returns sovereign-lib status

**Step 5: Run Python tests**

```bash
cd hf-proxy && python -m pytest tests/ -v
```

Expected: All tests pass.

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete motion intelligence dashboard transformation"
```

---

## Task 15: Documentation and Memory Update

**Files:**
- Modify: `CLAUDE.md` (if exists, update for new domain)
- Create: `docs/plans/2026-03-05-motion-intelligence-implementation.md` (this file — already created)

**Step 1: Update CLAUDE.md** to reflect the new motion intelligence domain, sovereign-lib integration, and dual LLM architecture.

**Step 2: Update auto-memory** with key architectural decisions and file paths for future sessions.

**Step 3: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: update project documentation for motion intelligence dashboard"
```

---

## Dependency Graph

```
Task 1 (configs) ─────────────────────────────────────────┐
Task 2 (LLM manager) ─┐                                   │
Task 3 (FastAPI) ──────┤── Task 4 (DataService) ──┐       │
Task 5 (theme) ────────┘                           │       │
                                                    ├── Task 6 (App shell)
                                                    │       │
Task 7  (ThesisTab) ───────────────────────────────┤       │
Task 8  (SensorNodesTab) ─────────────────────────┤       │
Task 9  (MotionPatternsTab) ──────────────────────┤       │
Task 10 (ModelRegistryTab) ───────────────────────┤       │
Task 11 (TopologyChainsTab) ──────────────────────┤       │
Task 12 (SignalMonitorTab) ───────────────────────┤       │
Task 13 (SessionFeedTab) ─────────────────────────┘       │
                                                            │
Task 14 (Integration) ─────────────────────────────────────┘
Task 15 (Documentation)
```

**Parallel opportunities:**
- Tasks 1, 2, 5 can run in parallel (no dependencies)
- Tasks 7-13 can run in parallel (independent tab rewrites, all depend on Tasks 4+6)
- Task 14 depends on all tabs being complete
