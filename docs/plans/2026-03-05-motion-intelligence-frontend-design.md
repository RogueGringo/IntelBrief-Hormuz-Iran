# Motion Intelligence Frontend Design

**Date:** 2026-03-05
**Status:** Approved
**Approach:** Surgical Transplant — tab-by-tab domain swap preserving proven architecture

## Context

Transform IntelAction_PanelZ from a geopolitical intelligence dashboard (Strait of Hormuz crisis tracking) into a motion intelligence front/middle end for sovereign-lib (topological motion analysis pipeline).

### Hardware Target

- CPU: Intel i9-13980HX (24c/32t)
- GPU: RTX 4080 Laptop (12GB VRAM, CUDA 13.1)
- RAM: 64GB DDR5-4800
- Storage: Samsung 980 Pro 2TB + WD_BLACK SN770 1TB NVMe
- NPU: None (13th gen)

### Source Projects

- **IntelAction_PanelZ**: React 18 + Vite + FastAPI dashboard. Aggregates RSS feeds + commodity prices, classifies signals as EFFECT/EVENT via keyword scoring, maps causal chains, tracks 20 signals with phase-transition detection. ~3K lines.
- **sovereign-lib**: Python topological motion pipeline. Sense (IMU to 90 features) -> Encode (persistent homology, sheaf cohomology) -> Remember (LLM distillation). 623 tests, ~8.8K lines. Proven on golf (30 real shots, 100% phase detection).

## Architecture

```
+-----------------------------------------------------------+
|                    REACT FRONTEND                          |
|  Thesis | Sensor Nodes | Motion Patterns | Model Registry |
|  Topology Chains | Signal Monitor | Session Feed          |
|                        |                                   |
|                  DataService.jsx                            |
|            (fetch -> classify -> cache)                     |
+------------------------+----------------------------------+
                         | HTTP/REST
+------------------------v----------------------------------+
|               FASTAPI MIDDLE LAYER                         |
|                                                            |
|  HOT PATH (direct import)      COLD PATH (CLI)            |
|  - sovereign_motion.features   - sovereign agent plan      |
|  - sovereign_motion.transform  - sovereign agent loop      |
|  - sovereign_topo.signature    - sovereign ioa curriculum  |
|  - sovereign_topo.persistence  - sovereign agent dashboard |
|                                                            |
|  +------------------------------------------------------+ |
|  |              LLM MANAGER                              | |
|  |  GPU: 8B Q5 (classify, analyze, embed) ~6.5GB VRAM   | |
|  |  CPU: 32B Q4 (coach, distill, deep)   ~20GB RAM      | |
|  |  Backend: llama-cpp-python (GGUF)                     | |
|  +------------------------------------------------------+ |
+-----------------------------------------------------------+
                         |
+------------------------v----------------------------------+
|                  FILE SYSTEM                               |
|  /swings/      - uploaded CSVs + ground truth              |
|  /models/      - trained student LLMs (GGUF)              |
|  /checkpoints/ - agent loop state                          |
|  /baselines/   - reference swing signatures                |
+-----------------------------------------------------------+
```

### Key Architectural Decisions

1. **Single FastAPI process owns the GPU** — no VRAM contention
2. **Hybrid coupling**: direct Python import for hot-path (features, topology, GPU LLM), CLI subprocess for cold-path (agent loop, curriculum, model registry)
3. **Source-agnostic ingestion**: R10, GCQuad, any CSV normalized to SwingRecord
4. **Dual LLM runtime**: GPU for real-time (<100ms), CPU for batch (2-5s)
5. **File-based storage**: no database needed for batch workflow
6. **Preserved patterns**: multi-layer fallback, TTL caching, auto-refresh from original dashboard

## Tab Mapping

### Tab 1: THE THESIS

Topological motion analysis framework. Why persistent homology captures motion structure that raw IMU statistics miss. Sense->Encode->Remember pipeline explained visually. Phase transitions reframed as topological state changes.

### Tab 2: SENSOR NODES (was Tracking Nodes)

5 categories of motion pipeline health:

| Category | Signals |
|---|---|
| IMU Health | Sample rate, axis saturation, noise floor, drift |
| Feature Pipeline | 90-feature extraction status, phase confidence, kinematic chain integrity |
| Topology Engine | H0/H1/H2 status, persistence lifetime, sheaf coherence |
| LLM Status | GPU model loaded, CPU model status, VRAM usage, inference latency |
| Data Inventory | Swings ingested, ground truth coverage, baseline count, unprocessed queue |

### Tab 3: MOTION PATTERNS (was Patterns of Life)

Historical swing signature analysis. Persistence diagram overlays. Phase timing consistency. Baseline vs session deviation. Topological improvement trends.

### Tab 4: MODEL REGISTRY (was Portfolio Map)

Local LLM inventory and training status. GPU/CPU model details. IOA curriculum progress. Distillation history with loss curves. One-click model swap and training triggers.

### Tab 5: TOPOLOGY CHAINS (was Effect Chains)

Topological signature visualization. Persistence diagrams (birth-death plots). Sheaf restriction maps (per-joint coherence heatmap). CST discontinuity reports. Side-by-side swing comparison.

### Tab 6: SIGNAL MONITOR (stays)

20 motion quality signals with dynamic thresholds:

| Signal | GREEN | YELLOW | RED |
|---|---|---|---|
| Phase detection confidence | >95% | 80-95% | <80% |
| Sample rate consistency | +/-1% | +/-5% | >5% |
| Sheaf coherence | >0.8 | 0.5-0.8 | <0.5 |
| LLM classification confidence | >90% | 70-90% | <70% |
| Feature completeness | 90/90 | 80+ | <80 |

### Tab 7: SESSION FEED (was Live Feed)

Swing-by-swing session log. Each entry: shot number, phase timing, topological summary, ground truth metrics. Classification: CLEAN/NOISY/ANOMALY. LLM coaching notes on demand. Filterable and sortable.

## API Endpoints

### Hot Path (direct import)

```
POST /api/ingest          - Upload CSV + ground truth -> SwingRecord[]
POST /api/features/{id}   - Extract 90 features
POST /api/encode/{id}     - Compute TopologicalMotionSignature
POST /api/classify/{id}   - GPU LLM classifies signal quality
POST /api/analyze/{id}    - Full pipeline: ingest->features->encode->classify
POST /api/batch           - Process multiple swings
GET  /api/swings          - List ingested swings + status
GET  /api/swing/{id}      - Full swing detail
GET  /api/baselines       - Reference signatures
GET  /api/signals         - 20-signal health monitor
GET  /api/llm/status      - GPU/CPU model status
```

### Cold Path (CLI orchestration)

```
POST /api/coach/{id}      - CPU LLM coaching insights
POST /api/distill         - IOA distillation run
POST /api/curriculum      - Generate training curriculum
GET  /api/agent/plan      - Planner recommendations
GET  /api/agent/dashboard - Model registry
POST /api/agent/loop      - Trigger improvement cycle
GET  /api/models          - List trained models
POST /api/models/swap     - Hot-swap GPU/CPU model
```

### Shared

```
GET  /api/health          - Service health
GET  /api/compare?a=X&b=Y - Compare two swings
```

## LLM Manager

### Dual-Model Runtime

- **GPU Slot** (12GB VRAM): Llama 3 8B Q5_K_M (~6.5GB). Always warm. Classify, analyze, embed. <100ms inference.
- **CPU Slot** (64GB RAM): Qwen2.5 32B Q4_K_M (~20GB). Load on demand. Coach, distill, deep analysis. 2-5s/response.
- **Backend**: llama-cpp-python with GGUF format on both slots.

### Four Roles

| Role | Model | Purpose | Latency |
|---|---|---|---|
| Classifier | GPU 8B | Swing quality: CLEAN/NOISY/ANOMALY | <100ms |
| Analyzer | GPU 8B | Natural language swing summary | ~200ms |
| Coach | CPU 32B | Coaching recommendations from full context | 2-5s |
| Distiller | GPU 8B (student) | IOA pipeline training via sovereign-lib | Minutes/unit |

### Safeguards

- Mutex on GPU slot (no concurrent loads)
- VRAM budget check before swap
- Graceful fallback: GPU full -> route to CPU
- Health check: restart model on OOM

## Classification Engine

### Vocabulary Swap

**CLEAN indicators** (was EFFECT): phase terms, topology health, data quality, feature confidence keywords.

**NOISY indicators** (was EVENT): sensor issues, phase ambiguity, topology warnings, data gap keywords.

### Algorithm (preserved)

```
Score = (cleanHits - noisyHits) / (cleanHits + noisyHits)
CLEAN  if score >  0.15
NOISY  if score < -0.15
MIXED  otherwise
Confidence = min(100, (totalHits / 8) * 100)
```

Keyword classifier acts as fast pre-filter. GPU LLM provides second-pass semantic classification. Dashboard shows both.

### Five Topology Chains (was Causal Chains)

| Chain | Flow |
|---|---|
| IMU Integrity | Sensor health -> feature reliability -> topology validity |
| Kinematic | Phase detection -> segment modeling -> motion reconstruction |
| Persistence | Point cloud quality -> homology computation -> signature stability |
| Sheaf Coherence | Joint fiber bundles -> restriction maps -> global coherence |
| LLM Confidence | Embedding quality -> classification certainty -> coaching reliability |

## Caching Strategy

| Data | TTL | Reason |
|---|---|---|
| Swing inventory | 30s | Changes only on upload |
| Feature vectors | Permanent | Deterministic |
| Topological signatures | Permanent | Deterministic |
| LLM classifications | None | May change with model swaps |
| Signal monitor | 5s | Real-time pipeline state |
| Coaching insights | Permanent | Expensive, deterministic per model |
| Model registry | 10s | Changes on train/swap |

## Data Flow (Typical Session)

1. Upload batch of swing CSVs + R10/GCQuad ground truth
2. Middle layer ingests -> sovereign_motion extracts 90 features
3. Topology engine encodes signatures (hot path, GPU-assisted)
4. GPU LLM classifies signal quality + detects anomalies
5. Dashboard updates: Session Feed, Topology Chains, Motion Patterns
6. User triggers "deep analysis" from dashboard
7. CPU LLM generates coaching insights per swing
8. Agent planner (CLI, cold path) recommends next training actions
9. Distillation runs kicked off from Model Registry tab
