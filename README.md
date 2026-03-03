# Valor Energy Partners — Strategic Intelligence Brief

**Why tracking *effects* instead of events gives you a structural edge in every market regime — and an almost unfair advantage during phase transitions.**

**[View the Live Dashboard](https://roguegringo.github.io/IntelBrief-Hormuz-Iran/)**

---

## What This Is

An interactive intelligence dashboard that demonstrates the **Geometry of Being** framework applied to the March 2026 Strait of Hormuz crisis. Instead of tracking headlines and analyst predictions (events), this dashboard tracks what physically changed in the real world (effects) — and shows why the difference is the entire game during phase transitions.

### The Seven Tabs

| Tab | What It Shows |
|-----|---------------|
| **The Thesis** | Core framework: events vs. effects, phase transitions, and Gini trajectory (signal consolidation vs. dispersion) |
| **Tracking Nodes** | 17 effect-indicators across four causal layers: insurance (kernel), physical flows, price architecture, domestic supply |
| **Patterns of Life** | Tanker transit visualization through Hormuz — from 138/day to zero. Event stacking, derivative analysis, and statistical phase detection |
| **Portfolio Map** | Four E&P prospects on a risk-reward surface, from $175K Arbuckle conventionals to $12M Pearsall unconventionals |
| **Effect Chains** | How condition:states cascade — insurance withdrawal → transit collapse → VLCC records → LNG force majeure |
| **Signal Monitor** | Live condition:state tracker with coherence gauge, severity filters, and semantic signal analyzer |
| **Live Feed** | Aggregated open-source intelligence auto-classified as effects (signal) or events (noise) |

### Key Concepts

- **Effects over Events** — "7/12 P&I clubs withdrew coverage" tells you more than "Iran closed the Strait"
- **Phase Transitions** — When the rules change, not just the numbers. Water → ice. Open Hormuz → closed Hormuz
- **Gini Trajectory** — Are independent signals consolidating (structural shift) or dispersing (transient shock)?
- **Kernel Condition** — Insurance is the binary gate. Either ships can sail insured, or they can't
- **Derivative Decision-Making** — Rate of change (dx/dt) and acceleration (d²x/dt²) detect phase transitions before announcements

---

## Quick Start

Click the link above. That's it. The dashboard runs entirely in your browser — no installation, no accounts, no backend.

If you want to run it locally:

```bash
git clone https://github.com/RogueGringo/IntelBrief-Hormuz-Iran.git
cd IntelBrief-Hormuz-Iran
npm install
npm run dev
```

Opens at `http://localhost:5173`

---

## Deploy Your Own Copy

### 1. Fork or clone this repo

### 2. Enable GitHub Pages
1. Go to **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. Push to `main` — the workflow triggers automatically

### 3. Wait ~60 seconds
Your site will be live at:
```
https://YOUR_USERNAME.github.io/IntelBrief-Hormuz-Iran/
```

If you rename the repo, update `vite.config.js` line 6:
```js
base: '/your-repo-name/',
```

### Custom domain (optional)
1. Add a `CNAME` file to `public/` with your domain
2. DNS: CNAME record pointing to `YOUR_USERNAME.github.io`
3. Settings → Pages → Custom domain
4. Set `base: '/'` in `vite.config.js`

---

## Additional Content

The `additional content/` folder contains supplementary materials:

- **The Hormuz Effect** (PDF) — Full research paper
- **Decoding Iran-Hormuz** (Video) — Visual walkthrough
- **Topological Arbitrage** (Audio) — From Hormuz to AI

---

## Architecture

Single-page React app. No backend, no API keys, no database. Deploys as static files to GitHub Pages.

- **React 18** + **Vite 5** — fast builds, HMR in dev
- **Zero external UI dependencies** — all components built from scratch
- **Inline CSS** — no build-time CSS tooling needed
- **RSS integration** — client-side feed parsing with CORS proxy fallback to scenario data
- **SVG charts** — hand-built, no charting library dependency

---

*Valor Energy Partners · March 2026*
