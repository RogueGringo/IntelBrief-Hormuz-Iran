# Sovereign Motion Dashboard

Front and middle end for [sovereign-lib](../sovereign-lib/) — topological motion intelligence.

## Architecture

- **Frontend:** React 18 + Vite — 7-tab motion intelligence dashboard
- **Middle Layer:** FastAPI bridging sovereign-lib (hot path: direct import, cold path: CLI)
- **LLM Runtime:** Dual model — GPU 8B (real-time) + CPU 32B (batch)

## Quick Start

### Backend
```bash
cd hf-proxy
pip install -r requirements.txt
python app.py
```

### Frontend
```bash
npm install
npm run dev
```
