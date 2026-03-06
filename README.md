# Sovereign Motion

Topological motion intelligence platform — capture, encode, and analyze motion patterns from STEVAL-PROTEUS1 IMU sensor.

## Architecture

```
STEVAL-PROTEUS1 (ISM330DHCX 500Hz + IIS3DWB 26.7kHz)
    │ USB Serial
    ▼
FastAPI Backend (42 endpoints)
    ├── sovereign_motion: 91-feature extraction, 8-phase detection
    ├── sovereign_topo: persistent homology, 40D embeddings
    ├── Classification + rule-based coaching
    └── Webhook integrations
    │
    ▼
React Dashboard (9 tabs)
    ├── The Thesis — topological motion intelligence overview
    ├── Sensor Nodes — live PROTEUS1 connection, config, streaming
    ├── Motion Patterns — persistence diagrams, phase timing, signatures
    ├── Model Registry — LLM model management
    ├── Topology Chains — sheaf coherence, CST, comparison radar
    ├── Progress — multi-session trend analysis with moving averages
    ├── Signal Monitor — 29 motion quality signals
    ├── Session Feed — upload, analyze, coach, export, replay
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
docker build -t sovereign-motion .
docker run -p 7860:7860 sovereign-motion
```

## Key Features

- **91-feature IMU analysis** — accelerometer + gyroscope feature extraction
- **8-phase motion detection** — idle, onset, load, peak_load, drive, impact, follow, recovery
- **Persistent homology** — Betti numbers, persistence diagrams, topological embeddings
- **Waveform replay** — animated playback with phase overlay
- **Session comparison** — cosine similarity, feature radar, side-by-side
- **Progress tracking** — multi-session trends with configurable metrics
- **Print-ready reports** — formatted HTML reports with print dialog
- **CSV/JSON export** — full dataset export for downstream analysis
- **Webhook integrations** — HTTP POST on session.analyzed events
- **Rule-based coaching** — actionable advice without LLM dependency
- **PWA installable** — standalone web app manifest
- **Toast notifications** — real-time action feedback

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Sensor | STEVAL-PROTEUS1 (STM32WB5MMG) |
| Firmware | Zephyr RTOS (sovereign-sensor) |
| Backend | Python 3.11, FastAPI, sovereign-lib |
| Frontend | React 18, Vite 5, Recharts 2 |
| Analysis | NumPy, SciPy, scikit-learn |
| Deploy | Docker, Hugging Face Spaces |

## API Documentation

Interactive docs at `/api/docs` (Swagger) and `/api/redoc` (ReDoc).
