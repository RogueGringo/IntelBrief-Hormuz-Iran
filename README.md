# Sovereign Motion

Topological motion intelligence platform — capture, encode, and analyze motion patterns from IMU sensors. Domain-agnostic: works for golf swings, deadlifts, machine vibration, PT exercises, or any repetitive motion.

## Architecture

```
STEVAL-PROTEUS1 (ISM330DHCX 500Hz + IIS3DWB 26.7kHz)
    │ USB Serial / CSV Upload
    ▼
FastAPI Backend (58 endpoints)
    ├── sovereign_motion: 91-feature extraction, 8-phase detection
    ├── sovereign_topo: persistent homology, 40D embeddings
    ├── User-trainable classifier (k-NN + MLP)
    ├── Rule-based coaching + LLM coaching
    ├── Anomaly detection (z-score analysis)
    └── Webhook integrations
    │
    ▼
React Dashboard (9 tabs)
    ├── The Thesis — topological motion intelligence overview
    ├── Sensor Nodes — live PROTEUS1 connection, config, streaming
    ├── Motion Patterns — persistence diagrams, phase timing, signatures
    ├── Model Registry — LLM model management + classifier panel
    ├── Topology Chains — sheaf coherence, CST, comparison radar
    ├── Progress — trend analysis, anomaly detection, session comparison
    ├── Signal Monitor — 29 motion quality signals
    ├── Session Feed — upload, analyze, coach, label, export, replay
    └── Settings — sensor config, analysis pipeline, webhooks
```

## Quick Start

### Development
```bash
# Backend (port 8000)
cd hf-proxy && pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# Frontend (port 5173, proxies /api to backend)
npm install && npm run dev
```

### Production
```bash
npm run build
cp -r dist hf-proxy/static
cd hf-proxy && uvicorn app:app --host 0.0.0.0 --port 7860
```

### Docker
```bash
docker compose up        # recommended
# or
docker build -t sovereign-motion .
docker run -p 7860:7860 -v motion-data:/home/user/app/data sovereign-motion
```

## Configuration

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `SOVEREIGN_API_KEY` | *(none)* | API key for authentication (optional) |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `LOG_LEVEL` | `INFO` | Logging level |
| `MAX_UPLOAD_MB` | `50` | Max CSV upload size |
| `RATE_LIMIT` | `60/minute` | Default API rate limit |

## Key Features

- **91-feature IMU analysis** — accelerometer + gyroscope feature extraction
- **8-phase motion detection** — idle, onset, load, peak_load, drive, impact, follow, recovery
- **Persistent homology** — Betti numbers, persistence diagrams, 40D topological embeddings
- **User-trainable classifier** — label sessions to teach motion classes; k-NN (instant) + MLP (trained)
- **Anomaly detection** — z-score analysis flags unusual sessions automatically
- **Session comparison** — cosine similarity, feature radar, side-by-side delta tables
- **Progress tracking** — multi-session trends with configurable metrics and moving averages
- **Waveform replay** — animated playback with phase overlay
- **CSV/JSON export** — full dataset export for downstream analysis
- **Webhook integrations** — HTTP POST on session.analyzed events
- **Rule-based coaching** — actionable advice without LLM dependency
- **API key auth** — optional authentication via X-API-Key header
- **Rate limiting** — per-IP throttling on expensive endpoints
- **PWA installable** — offline-capable web app with service worker
- **Keyboard shortcuts** — press `?` for shortcuts overlay

## Python SDK

```bash
pip install -e sdk/
```

```python
from sovereign_client import SovereignClient

client = SovereignClient("http://localhost:8000")

# Upload and analyze
session = client.upload("capture.csv")
result = client.analyze(session["id"])

# Label for classifier training
client.set_label(session["id"], "golf_swing")

# Train classifier
client.train_classifier()

# Export as DataFrame
df = client.export_dataframe()
```

## Testing

```bash
# Backend unit tests (38 tests)
cd hf-proxy && python -m pytest tests/ -v

# Integration tests (14 tests)
python -m pytest tests/test_api.py -v
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Sensor | STEVAL-PROTEUS1 (STM32WB5MMG) |
| Firmware | Zephyr RTOS v3.7.1 (sovereign-sensor) |
| Backend | Python 3.11, FastAPI, sovereign-lib, slowapi |
| Frontend | React 18, Vite 5, Recharts 2 |
| Analysis | NumPy, SciPy, scikit-learn |
| Deploy | Docker, Docker Compose, Hugging Face Spaces |

## API Documentation

Interactive docs at `/api/docs` (Swagger) and `/api/redoc` (ReDoc).
