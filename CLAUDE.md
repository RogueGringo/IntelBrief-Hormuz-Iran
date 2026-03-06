# Sovereign Motion Dashboard

## What This Is
Front and middle end for [sovereign-lib](../sovereign-lib/) — topological motion intelligence.

Transforms raw IMU sensor data into topological signatures via sovereign-lib's Sense→Encode→Remember pipeline, with dual local LLM inference for real-time classification and batch coaching.

## Architecture

```
React 18 + Vite (7 tabs) → FastAPI middle layer → sovereign-lib (Python)
                                    ↓
                         Dual LLM (GPU 8B + CPU 32B)
```

### Frontend (src/)
- `App.jsx` — Main dashboard, all tab components except SessionFeed and MotionPatterns
- `LiveFeedTab.jsx` — SessionFeedTab (swing-by-swing log with upload)
- `PatternsTab.jsx` — MotionPatternsTab (persistence diagrams, swing table)
- `DataService.jsx` — API client with caching (30s swings, 5s signals, permanent features/topology)
- `theme.js` — Colors, category colors, classification colors

### Backend (hf-proxy/)
- `app.py` — FastAPI with 21 endpoints (hot path: direct sovereign-lib import, cold path: CLI subprocess)
- `llm_manager.py` — Dual GPU/CPU model manager via llama-cpp-python
- `swing_store.py` — File-based JSON swing record storage
- `tests/` — pytest suite (12 tests)

### 7 Tabs
1. THE THESIS — Topological motion analysis framework (static)
2. SENSOR NODES — 20 pipeline health signals across 5 categories
3. MOTION PATTERNS — Persistence diagram overlays, swing table
4. MODEL REGISTRY — GPU/CPU LLM slots, GGUF models, IOA curriculum, agent actions
5. TOPOLOGY CHAINS — Chain selector, persistence diagrams, sheaf coherence, CST, comparison
6. SIGNAL MONITOR — 20 motion quality signals with semantic analyzer
7. SESSION FEED — CSV upload, swing cards, analyze/coach actions

## Key Patterns
- Classification: CLEAN/NOISY/MIXED via keyword scoring (same algorithm as original EFFECT/EVENT)
- Caching: TTL-based client cache, permanent for deterministic computations
- LLM: GPU slot (8B, <100ms) for classify/analyze, CPU slot (32B, 2-5s) for coach/distill
- sovereign-lib integration: hot path = direct Python import, cold path = CLI subprocess

## Commands
```bash
# Frontend dev
npm run dev

# Backend
cd hf-proxy && python app.py

# Tests
cd hf-proxy && python -m pytest tests/ -v

# Build
npm run build
```

## Hardware Target
- Intel i9-13980HX, RTX 4080 12GB, 64GB DDR5
- GPU: ~7B models at fp16, ~13B at Q4
- CPU: up to 70B Q4 in RAM
