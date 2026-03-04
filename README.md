# Valor Energy Partners — Strategic Intelligence Brief

**[View the Live Dashboard](https://roguegringo.github.io/IntelBrief-Hormuz-Iran/)**

---

An intelligence dashboard that tracks **what physically changed** in the Strait of Hormuz crisis — not what analysts predicted. Effects over events.

- **Signal Monitor** — Live commodity prices (Brent, WTI, OVX), insurance states, physical flow indicators. Auto-refreshes from real market data.
- **Live Feed** — 9 open-source RSS feeds classified as **effects** (measurable changes) or **events** (narrative/prediction). Auto-refreshes every 3 minutes.
- **Patterns of Life** — Tanker transit visualization, derivative analysis, statistical phase detection.
- **Effect Chains** — How condition:states cascade through insurance, physical flows, price architecture, and supply.
- **Portfolio Map** — Four E&P prospects positioned on a risk-reward surface calibrated to the current regime.

### How It Works

Click the link. Everything runs in your browser — no accounts, no installation, no backend required.

For live commodity prices: the dashboard connects to a backend proxy on Hugging Face Spaces. Without it, prices fall back to public CORS proxies or scenario data. RSS feeds work either way.

### Architecture

Single-page React app. Vite build. Deploys as static files to GitHub Pages via Actions. Zero external UI dependencies.

Optional backend: `hf-proxy/` contains a FastAPI service for Hugging Face Spaces that provides server-side RSS aggregation and real-time commodity prices via `yfinance`. Deploy it to get reliable, CORS-free live data.

---

*Valor Energy Partners*
