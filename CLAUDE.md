# Sovereign Motion Dashboard

## What This Is
Front and middle end for [sovereign-lib](../sovereign-lib/) — topological motion intelligence.

Transforms raw IMU sensor data into topological signatures via sovereign-lib's Sense→Encode→Remember pipeline, with dual local LLM inference for real-time classification and batch coaching.

## Architecture

```
React 18 + Vite (9 tabs) → FastAPI middle layer → sovereign-lib (Python)
                                    ↓
                         Dual LLM (GPU 8B + CPU 32B)
```

### Frontend (src/)
- `App.jsx` — Main dashboard: OperationalOverview, EmbeddingScatter, TopologyChainsTab, SensorNodesTab, ModelRegistryTab, SignalMonitorTab, ThesisTab
- `LiveFeedTab.jsx` — SessionFeedTab (swing-by-swing log with upload, IMU waveform charts)
- `PatternsTab.jsx` — MotionPatternsTab (persistence diagrams, swing table)
- `ProgressTab.jsx` — Multi-session trend analysis, charts, radar, heatmap, comparison
- `SettingsTab.jsx` — Configuration, webhooks, danger zone
- `DataService.jsx` — API client with caching (30s swings, 5s signals, 15s embeddings/trends)
- `theme.js` — Colors, category colors, classification colors
- `Toasts.jsx` — Toast notification system
- `ErrorBoundary.jsx` — Error boundary wrapper

### Backend (hf-proxy/)
- `app.py` — FastAPI with 50+ endpoints (hot path: direct sovereign-lib import, cold path: CLI subprocess)
- `llm_manager.py` — Dual GPU/CPU model manager via llama-cpp-python
- `swing_store.py` — File-based JSON swing record storage
- `tests/` — pytest suite (38 tests)

### 9 Tabs
1. THE THESIS — Operational command center + topological framework overview
2. SENSOR NODES — 20 pipeline health signals, hardware sensor panel, live stream
3. MOTION PATTERNS — Persistence diagram overlays, swing table
4. MODEL REGISTRY — GPU/CPU LLM slots, motion classifier with confusion matrix
5. TOPOLOGY CHAINS — Embedding landscape (40D→2D PCA), persistence diagrams, sheaf coherence, comparison
6. PROGRESS — Multi-session trends, classification distribution, radar chart, phase heatmap
7. SIGNAL MONITOR — 20 motion quality signals with semantic analyzer
8. SESSION FEED — CSV upload, swing cards, analyze/coach/label/export, bulk operations
9. SETTINGS — Configuration, webhooks, export, danger zone

## Key Patterns
- Classification: User-trainable k-NN + MLP on 40D topological embeddings
- Caching: TTL-based client cache, permanent for deterministic computations
- LLM: GPU slot (8B, <100ms) for classify/analyze, CPU slot (32B, 2-5s) for coach/distill
- sovereign-lib integration: hot path = direct Python import, cold path = CLI subprocess
- Pipeline refresh: POST /api/pipeline/refresh → analyze all → train → reclassify
- Embedding map: GET /api/embeddings/map → PCA projection of all session embeddings
- Quick-label: Right-click points in embedding scatter to label sessions

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
