# Chopper Motion

```
 ██████╗██╗  ██╗ ██████╗ ██████╗ ██████╗ ███████╗██████╗
██╔════╝██║  ██║██╔═══██╗██╔══██╗██╔══██╗██╔════╝██╔══██╗
██║     ███████║██║   ██║██████╔╝██████╔╝█████╗  ██████╔╝
██║     ██╔══██║██║   ██║██╔═══╝ ██╔═══╝ ██╔══╝  ██╔══██╗
╚██████╗██║  ██║╚██████╔╝██║     ██║     ███████╗██║  ██║
 ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝     ╚══════╝╚═╝  ╚═╝
   ███╗   ███╗ ██████╗ ████████╗██╗ ██████╗ ███╗   ██╗
   ████╗ ████║██╔═══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║
   ██╔████╔██║██║   ██║   ██║   ██║██║   ██║██╔██╗ ██║
   ██║╚██╔╝██║██║   ██║   ██║   ██║██║   ██║██║╚██╗██║
   ██║ ╚═╝ ██║╚██████╔╝   ██║   ██║╚██████╔╝██║ ╚████║
   ╚═╝     ╚═╝ ╚═════╝    ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
```

> Sovereign topological motion intelligence. Your sensor. Your topology. Your rules.

**Proprietary — JtechAi LLC & B. Jones. All rights reserved.**

---

## Origin Story

There was a swing.

Not a metaphorical swing. A real one — a golf club moving at 95 mph through three-dimensional space while a $40,000 launch monitor captured every microsecond of its trajectory. GCQuad. Trackman. Full nine yards. High-speed cameras. Doppler radar. The kind of setup that makes a biomechanics lab look like a toy store.

And after all of it — the capture, the data, the analysis — the output was a number. Ball speed. Launch angle. Spin rate. A *number*. As if the 400 milliseconds of the most complex athletic motion the human body produces could be reduced to six floating-point values and a recommendation to "strengthen your grip."

That's not intelligence. That's a lookup table with marketing.

The motion was always more than the numbers. Every swing has a *shape* — not the shape of the club path, but the shape of the data itself. The topology. The holes in the persistence diagram where energy dissipates. The Betti numbers that tell you how many independent cycles of coordination are happening simultaneously. The sheaf coherence that measures whether your wrists, shoulders, and hips are actually talking to each other or just happening to be in the same body at the same time.

Nobody was looking at this. Nobody was *equipped* to look at this. The math existed — algebraic topology, persistent homology, sheaf theory — but it lived in pure mathematics departments where the closest thing to an athletic motion was the walk to the coffee machine. And the sports science world had accelerometers and gyroscopes but was still doing peak detection and threshold crossing like it was 1997.

Two worlds. No bridge.

**Chopper Motion is the bridge.**

### Chapter Two: The Sensor

We didn't want someone else's data pipeline. We wanted ours.

The STEVAL-PROTEUS1 is a development board from ST Microelectronics. STM32WB5MMG. Cortex-M4 at 64MHz. Bluetooth 5.0. And packed onto that board: the ISM330DHCX — a 6-axis IMU that samples at 500Hz with the kind of noise floor that makes consumer wearables look like they're measuring earthquakes with a seismograph made of Jell-O.

But 500Hz wasn't enough. Not for impact.

A golf club impact lasts 0.5 milliseconds. At 500Hz, you get *zero* samples during impact. You don't even know it happened until it's over. It's like trying to photograph lightning with a security camera.

So we added the IIS3DWB. A wideband accelerometer. 26,700 samples per second. 26.7kHz. At that rate, you get 13 samples during a 0.5ms impact window. You can see the compression, the rebound, the frequency content of the strike. You can hear the ball on the face. In data.

But you can't run a 26.7kHz sensor continuously. The data would fill your storage in seconds. So the firmware learned to *predict impact*. The ISM330DHCX watches the gyroscope. When it detects a downswing — angular velocity crossing 50 degrees per second — it arms the IIS3DWB. The high-bandwidth sensor captures exactly the window that matters, then goes back to sleep.

Green LED: armed. Blue LED: capturing. Cyan: transferring. The board knows what it's doing.

Custom firmware. Zephyr RTOS. Raw SPI drivers for a sensor that doesn't have a Zephyr driver because we're the first ones asking it to do this. Every byte of data that comes off that USB cable is data *we* captured, on hardware *we* programmed, with firmware *we* wrote.

Sovereign from the silicon up.

### Chapter Three: The Topology

Here's where it gets interesting.

A motion capture session produces a time series. Accelerometer X, Y, Z. Gyroscope X, Y, Z. Maybe 5,000 samples at 500Hz for a 10-second capture. Most systems extract features from this: peak acceleration, duration, smoothness. That's fine. We do that too. 91 features, actually. Phase detection that segments every motion into 8 phases — idle, onset, load, peak_load, drive, impact, follow, recovery.

But then we do something nobody else does.

We take that time series and we build a point cloud. Not in 3D space — in *delay embedding* space. Takens' theorem says that if you time-delay embed a univariate signal, the topology of the resulting point cloud is diffeomorphic to the topology of the underlying dynamical system. Translation: the *shape* of the point cloud tells you the *shape* of the motion that produced it.

We compute persistent homology on that point cloud. Birth-death pairs. Persistence diagrams. Betti numbers at every filtration scale. H0 tells you how many connected components exist — how many distinct phases of motion your body went through. H1 tells you about loops — cyclical coordination patterns between joints. H2, if it appears, is three-dimensional void structure — rare, and when it shows up, it means something genuinely complex is happening.

Then we flatten the persistence diagram into a 40-dimensional embedding. That embedding is the topological fingerprint of your motion. Not what your body *did* — what the *shape* of what your body did looks like in homology space.

Two swings that look identical on video can have completely different topological signatures. One has a persistence diagram with a dominant H1 feature at scale 0.3 — a tight coordination loop between wrist and hip. The other has scattered short-lived H1 features — the same joints are moving but they're not coordinated. Same motion. Different topology. The first one goes 280 yards. The second one goes 230 and the golfer doesn't understand why.

*We* understand why. The topology told us.

### Chapter Four: The Classifier

Topology gives you the fingerprint. But a fingerprint is useless without a filing system.

The first time you use Chopper Motion, it knows nothing. No motion classes. No categories. No pre-built ontology of "good swing" vs "bad swing" because that's not our call to make. You're the expert. We're the instrument.

You label a session. "Golf swing." You label another one. "Deadlift." A third one: "PT shoulder rotation." Each label gets paired with its 40-dimensional topological embedding.

Now the classifier has data.

**Tier 1 — k-NN.** Cosine similarity in embedding space. Works with literally one example per class. You label one golf swing and the next thing that looks topologically similar gets auto-classified as a golf swing. Instant. No training. The manifold geometry does the work.

**Tier 2 — MLP.** Once any class hits 10 labeled examples, you can train a small neural network. 40→32→16→N. NumPy only — no PyTorch, no TensorFlow, no dependency hell. It trains in under a second on your machine. Accuracy goes up. The topology was already doing the heavy lifting; the MLP just learns the decision boundaries more precisely.

The classifier is *yours*. It learns what *you* teach it. Golf pro? It learns golf swings. Physical therapist? It learns PT exercises. Industrial engineer? It learns machine vibration patterns. Same math. Same topology. Different domain. Zero code changes.

That's what sovereign means. We built the instrument. You play the music.

### Chapter Five: The Dashboard

Nine tabs. One truth.

**THE THESIS** — Because if you can't explain what topological motion intelligence *is*, you can't trust it to tell you what your motion *means*.

**SENSOR NODES** — Live connection to the PROTEUS1. USB serial. SSE streaming. Capture daemon. Configure the sensor from the browser. Watch data arrive in real-time.

**MOTION PATTERNS** — Persistence diagrams rendered as interactive overlays. Phase timing. Swing signatures. The raw topology, visualized.

**MODEL REGISTRY** — Dual LLM slots. GPU for fast classification. CPU for deep coaching. GGUF models. Swap them hot. And the user-trained classifier panel — watch your label distribution grow, train the MLP, reclassify everything with one click.

**TOPOLOGY CHAINS** — Sheaf coherence. CST analysis. Comparison radar charts. This is where you go when you want to understand *why* two sessions are different at the structural level.

**PROGRESS** — Trend lines across sessions. Seven configurable metrics with moving averages. Anomaly detection that flags when a session's z-score exceeds 2 standard deviations. Session comparison with delta tables.

**SIGNAL MONITOR** — 29 motion quality signals across 5 categories. IMU integrity. Feature completeness. Topological stability. LLM confidence. Data quality. Each one a canary in the coal mine.

**SESSION FEED** — Upload. Analyze. Coach. Label. Compare. Download. Bulk select. Bulk label. Bulk delete. The workhorse tab. Drag-drop CSV files and watch them go from raw data to classified, coached sessions in seconds.

**SETTINGS** — Sensor thresholds. Analysis pipeline tuning. Webhook configuration. The dials behind the dashboard.

---

## What Is This?

Motion capture systems give you numbers. Chopper Motion gives you *topology*.

It takes raw IMU sensor data — accelerometer and gyroscope time series — and transforms it into topological signatures using persistent homology, sheaf coherence, and 40-dimensional embeddings. Then it classifies those signatures using a system *you* train, on categories *you* define, running on hardware *you* own.

The result is motion intelligence that no cloud service can revoke, no subscription can expire, and no vendor can lock you out of.

## Project Status

| Metric | Value |
|--------|-------|
| **Commits** | 165 |
| **Tests** | 52 passing |
| **Backend Endpoints** | 58 |
| **Frontend Tabs** | 9 |
| **Source Files** | 25+ |
| **Python** | >= 3.11 |
| **Node** | >= 20 |
| **License** | Proprietary — JtechAi LLC & B. Jones |
| **Last Updated** | 2026-03-06 |

## How It Works

```mermaid
flowchart LR
    A["📡 Capture\nIMU Sensor"] --> B["⚡ Extract\n91 Features"]
    B --> C["🔮 Encode\nTopology"]
    C --> D["🏷️ Classify\nk-NN / MLP"]
    D --> E["🧠 Coach\nLLM Analysis"]

    style A fill:#0a0c10,stroke:#d4a843,color:#e8e4dc
    style B fill:#0a0c10,stroke:#d4a843,color:#e8e4dc
    style C fill:#0a0c10,stroke:#d4a843,color:#e8e4dc
    style D fill:#0a0c10,stroke:#d4a843,color:#e8e4dc
    style E fill:#0a0c10,stroke:#d4a843,color:#e8e4dc
```

**Capture** — STEVAL-PROTEUS1 with ISM330DHCX (500Hz) and IIS3DWB (26.7kHz). Predictive impact arming. USB serial output.

**Extract** — 91 features from accelerometer and gyroscope data. 8-phase motion detection. Duration, peak acceleration, smoothness, energy, RMS, spectral features.

**Encode** — Persistent homology on delay-embedded point clouds. Betti numbers. Birth-death persistence diagrams. 40-dimensional topological embedding.

**Classify** — User-trainable two-tier classifier. k-NN with cosine similarity (instant, 1-shot). MLP with NumPy (trained, higher accuracy). Domain-agnostic.

**Coach** — Dual LLM inference. GPU slot (8B model, <100ms) for classification. CPU slot (32B model, 2-5s) for deep coaching. Rule-based fallback when no LLM is loaded.

## Architecture

```
STEVAL-PROTEUS1 (STM32WB5MMG, Zephyr RTOS)
    │ ISM330DHCX 500Hz + IIS3DWB 26.7kHz
    │ USB CDC Serial
    ▼
FastAPI Backend (58 endpoints)
    ├── sovereign_motion: 91 features, 8-phase detection
    ├── sovereign_topo: persistent homology, 40D embeddings
    ├── MotionClassifier: k-NN + MLP on embeddings
    ├── Dual LLM (GPU 8B + CPU 32B via llama-cpp)
    ├── Rate limiting, structured logging, API key auth
    ├── Webhook integrations, anomaly detection
    └── File-based session store with JSON persistence
    │
    ▼
React 18 Dashboard (9 tabs, Vite, Recharts)
    ├── Real-time sensor streaming (SSE)
    ├── Interactive persistence diagrams
    ├── User-trainable classifier panel
    ├── Bulk session operations
    ├── Session comparison & trend analysis
    ├── PWA installable with offline support
    └── Keyboard shortcuts, onboarding tour
    │
    ▼
Python SDK (pip installable)
    ├── 20+ methods for programmatic access
    ├── API key authentication
    ├── DataFrame export (pandas)
    └── Classifier training & labeling
```

## Quick Start

```bash
# Backend
cd hf-proxy && pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# Frontend (proxies /api to backend)
npm install && npm run dev

# Production
docker compose up
```

## Python SDK

```python
from sovereign_client import SovereignClient

client = SovereignClient("http://localhost:8000", api_key="your-key")

# Upload and analyze
session = client.upload("capture.csv")
result = client.analyze(session["id"])

# Label for classifier training
client.set_label(session["id"], "golf_swing")
client.set_label(other_id, "deadlift")

# Train the classifier
client.train_classifier()

# All future uploads auto-classify
next_session = client.upload_and_analyze("next_capture.csv")
# → classification: "golf_swing", confidence: 0.94

# Export everything as a DataFrame
df = client.export_dataframe()
```

## The Math Under the Hood

### Persistent Homology

Every motion session gets embedded into a point cloud via Takens' delay embedding. We compute the Vietoris-Rips filtration and track topological features across scales. H0 (connected components) = distinct motion phases. H1 (loops) = coordination cycles. The persistence diagram — which features are born, which die, which persist — is the topological fingerprint.

### Sheaf Coherence

A sheaf assigns data to regions and checks consistency across overlaps. In our context: each joint's time series is a local section, and sheaf coherence measures whether the global motion is more than the sum of its parts. High coherence = coordinated motion. Low coherence = independent joint movement.

### 40D Topological Embedding

The persistence diagram gets vectorized into a fixed-length representation: Betti curves sampled at 10 filtration values × 4 homology dimensions = 40 features. This embedding lives in a space where cosine similarity is geometrically meaningful — similar topologies are close, different topologies are far.

### Anomaly Detection

Z-score analysis across sessions. For each metric (peak acceleration, duration, smoothness, quality score), we compute the population mean and standard deviation. Sessions exceeding 2σ are flagged automatically. The system learns what "normal" looks like from *your* data.

## Modules

| Component | Purpose |
|-----------|---------|
| `hf-proxy/app.py` | FastAPI backend — 58 endpoints, rate limiting, logging |
| `hf-proxy/classifier.py` | MotionClassifier — k-NN + MLP on 40D embeddings |
| `hf-proxy/swing_store.py` | File-based session persistence |
| `hf-proxy/llm_manager.py` | Dual GPU/CPU LLM inference manager |
| `sovereign-lib/` | Core library — feature extraction, topology encoding |
| `src/App.jsx` | React dashboard — 9 tabs, 2000+ lines |
| `src/LiveFeedTab.jsx` | Session feed — upload, analyze, label, bulk ops |
| `src/ProgressTab.jsx` | Trend analysis, anomaly detection, comparison |
| `sdk/` | Python SDK — pip installable client library |
| `FW_DEV/` | STEVAL-PROTEUS1 firmware (Zephyr RTOS) |

## Hardware Target

| Component | Spec |
|-----------|------|
| **CPU** | Intel i9-13980HX (24C/32T) |
| **GPU** | NVIDIA RTX 4080 12GB |
| **RAM** | 64GB DDR5 |
| **Sensor** | STEVAL-PROTEUS1 (STM32WB5MMG) |
| **IMU** | ISM330DHCX (500Hz) + IIS3DWB (26.7kHz) |
| **Interface** | USB CDC Serial (COM4) |

## Testing

```bash
# Backend unit tests (38 tests — classifier, store, LLM)
cd hf-proxy && python -m pytest tests/ -v

# Integration tests (14 tests — API endpoints)
python -m pytest tests/test_api.py -v

# Frontend build verification
npm run build
```

## Security & Production

- **Rate limiting** — slowapi, per-IP throttling, stricter limits on expensive operations
- **API key auth** — optional `X-API-Key` header via `SOVEREIGN_API_KEY` env var
- **CORS** — configurable via `CORS_ORIGINS` env var
- **Upload limits** — 50MB max file size
- **Webhook validation** — SSRF protection, blocks internal/private addresses
- **Request logging** — structured logs with method, path, status, latency
- **Docker** — multi-stage build, non-root user, health checks

## License

**Proprietary** — Copyright (c) 2026 JtechAi LLC & B. Jones. All rights reserved.

This software is the exclusive property of JtechAi LLC and B. Jones. No license, right, or interest is granted except as expressly authorized in writing. See [LICENSE](./LICENSE) for full terms.

---

*Built on the premise that your motion data belongs to you, your analysis should run on your hardware, and the mathematics of shape and structure are too powerful to leave locked in a research paper.*

*Chopper Motion. Sovereign from the silicon up.*
