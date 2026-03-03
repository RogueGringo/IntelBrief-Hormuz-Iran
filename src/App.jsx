import { useState, useEffect, useCallback, useRef } from "react";
import LiveFeedTab from "./LiveFeedTab.jsx";
import PatternsTab from "./PatternsTab.jsx";

const COLORS = {
  bg: "#0a0c10",
  surface: "#12151c",
  surfaceHover: "#1a1e28",
  border: "#1e2330",
  borderActive: "#d4a843",
  gold: "#d4a843",
  goldDim: "#8a6e2f",
  goldBright: "#f0c95a",
  red: "#e04040",
  redDim: "#8b2020",
  green: "#3dba6f",
  greenDim: "#1d6b3a",
  blue: "#4a8fd4",
  blueDim: "#2a5580",
  text: "#e8e4dc",
  textDim: "#8a8678",
  textMuted: "#5a5850",
  orange: "#e08840",
  purple: "#9070d0",
};

// ─── SIGNAL MONITOR DATA ───────────────────────────────────
const SIGNALS = [
  { id: "pni", category: "kernel", name: "P&I Club Coverage", value: "3/12 active", numeric: 3, unit: "/12", severity: "critical", trend: "stable", jitter: 0 },
  { id: "warrisk", category: "kernel", name: "War Risk Premium", value: "Unquotable", numeric: null, unit: "", severity: "critical", trend: "stable", jitter: 0 },
  { id: "reinsure", category: "kernel", name: "Reinsurance Market", value: "Suspended", numeric: null, unit: "", severity: "critical", trend: "stable", jitter: 0 },
  { id: "ais", category: "physical", name: "Tanker AIS Transits", value: "0", numeric: 0, unit: "/day", severity: "critical", trend: "down", jitter: 0 },
  { id: "stranded", category: "physical", name: "Stranded Vessels", value: "152", numeric: 152, unit: "", severity: "high", trend: "up", jitter: 3 },
  { id: "bypass", category: "physical", name: "Bypass Pipeline Util.", value: "51%", numeric: 51, unit: "%", severity: "moderate", trend: "up", jitter: 2 },
  { id: "vlcc", category: "physical", name: "VLCC Spot Rate", value: "$423,736", numeric: 423736, unit: "/day", severity: "critical", trend: "up", jitter: 5000 },
  { id: "spr", category: "physical", name: "SPR Status", value: "No release", numeric: 0, unit: "", severity: "watch", trend: "stable", jitter: 0 },
  { id: "brent", category: "price", name: "Brent Front-Month", value: "$84.20", numeric: 84.2, unit: "/bbl", severity: "high", trend: "up", jitter: 0.4 },
  { id: "wti", category: "price", name: "WTI Cushing", value: "$76.35", numeric: 76.35, unit: "/bbl", severity: "moderate", trend: "up", jitter: 0.3 },
  { id: "spread", category: "price", name: "Brent-WTI Spread", value: "$7.85", numeric: 7.85, unit: "", severity: "high", trend: "up", jitter: 0.15 },
  { id: "ovx", category: "price", name: "OVX (Vol Index)", value: "65.4", numeric: 65.4, unit: "", severity: "high", trend: "up", jitter: 1.5 },
  { id: "kcposted", category: "price", name: "Kansas Common Posted", value: "$63.10", numeric: 63.1, unit: "/bbl", severity: "moderate", trend: "up", jitter: 0.25 },
  { id: "rigs", category: "domestic", name: "Baker Hughes Rig Count", value: "409", numeric: 409, unit: " rigs", severity: "moderate", trend: "stable", jitter: 0 },
  { id: "duc", category: "domestic", name: "DUC Inventory", value: "878", numeric: 878, unit: "", severity: "high", trend: "down", jitter: 0 },
  { id: "production", category: "domestic", name: "US Production", value: "13.5M", numeric: 13.5, unit: "M bpd", severity: "moderate", trend: "down", jitter: 0 },
];

// Thresholds for dynamic severity re-evaluation on signals that have numeric jitter
const SEVERITY_THRESHOLDS = {
  stranded: [["critical", 180], ["high", 140], ["moderate", 100]],
  bypass:   [["critical", 85],  ["high", 70],  ["moderate", 50]],
  vlcc:     [["critical", 350000], ["high", 250000], ["moderate", 150000]],
  brent:    [["critical", 90],  ["high", 80],  ["moderate", 70]],
  wti:      [["critical", 85],  ["high", 78],  ["moderate", 70]],
  spread:   [["critical", 10],  ["high", 7],   ["moderate", 4]],
  ovx:      [["critical", 80],  ["high", 60],  ["moderate", 40]],
  kcposted: [["critical", 80],  ["high", 72],  ["moderate", 60]],
};

function computeSeverity(id, numeric, baseSeverity) {
  const thresholds = SEVERITY_THRESHOLDS[id];
  if (!thresholds || numeric === null) return baseSeverity;
  for (const [level, threshold] of thresholds) {
    if (numeric >= threshold) return level;
  }
  return "watch";
}

const CATEGORY_META = {
  kernel: { label: "KERNEL CONDITION", color: COLORS.red },
  physical: { label: "PHYSICAL FLOWS", color: COLORS.orange },
  price: { label: "PRICE ARCHITECTURE", color: COLORS.blue },
  domestic: { label: "DOMESTIC SUPPLY", color: COLORS.purple },
};

const EFFECT_KEYWORDS = [
  "transit", "ais", "insurance", "p&i", "coverage", "vlcc", "freight",
  "force majeure", "spr", "drawdown", "rig count", "duc", "backwardation",
  "pipeline", "bpd", "production", "inventory", "withdrawn", "suspended",
  "collapsed", "stranded", "utilization", "capacity", "barrels", "tanker",
  "vessel", "rates", "premium", "reinsurance", "spread", "curve", "netback",
  "breakeven", "dolomite", "overpressured", "wellbore", "measured", "binary",
];

const EVENT_KEYWORDS = [
  "announced", "predicted", "analysts say", "expected", "could", "might",
  "sources say", "reportedly", "sentiment", "fears", "hopes", "rally",
  "tumble", "surge", "plunge", "breaking", "rumor", "speculation",
  "believes", "opinion", "according to", "may", "possibly", "likely",
  "forecast", "projected", "risk of", "warns", "caution", "concerned",
  "worried", "optimistic", "pessimistic", "bullish", "bearish", "mood",
];

// ─── HEADER ────────────────────────────────────────────────
function Header({ activeTab, setActiveTab }) {
  const tabs = [
    { id: "thesis", label: "THE THESIS" },
    { id: "nodes", label: "TRACKING NODES" },
    { id: "patterns", label: "PATTERNS OF LIFE" },
    { id: "portfolio", label: "PORTFOLIO MAP" },
    { id: "playbook", label: "EFFECT CHAINS" },
    { id: "monitor", label: "SIGNAL MONITOR" },
    { id: "feed", label: "LIVE FEED" },
  ];
  return (
    <div style={{ borderBottom: `1px solid ${COLORS.border}`, padding: "24px 32px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 4 }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, color: COLORS.gold, letterSpacing: -0.5 }}>
          VALOR ENERGY PARTNERS
        </span>
        <span style={{ fontSize: 11, color: COLORS.textMuted, letterSpacing: 3, textTransform: "uppercase" }}>
          Strategic Intelligence Brief · March 2026
        </span>
      </div>
      <p style={{ fontSize: 13, color: COLORS.textDim, margin: "4px 0 16px", maxWidth: 720, lineHeight: 1.5 }}>
        Why tracking <em>effects</em> instead of events gives you a structural edge in every market regime — 
        and an almost unfair advantage during phase transitions.
      </p>
      <div style={{ display: "flex", gap: 0 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: "10px 20px",
              background: activeTab === t.id ? COLORS.surface : "transparent",
              border: "1px solid",
              borderColor: activeTab === t.id ? COLORS.border : "transparent",
              borderBottom: activeTab === t.id ? `2px solid ${COLORS.gold}` : "2px solid transparent",
              borderRadius: "6px 6px 0 0",
              color: activeTab === t.id ? COLORS.gold : COLORS.textMuted,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.5,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── THESIS TAB ────────────────────────────────────────────
function ThesisTab() {
  return (
    <div style={{ padding: "32px", maxWidth: 1100 }}>
      {/* Central concept */}
      <div style={{
        background: `linear-gradient(135deg, ${COLORS.surface} 0%, #161a24 100%)`,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "32px 36px",
        marginBottom: 28,
      }}>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, color: COLORS.gold, margin: "0 0 16px", fontWeight: 600 }}>
          The Core Insight: Events Are the Weather. Effects Are the Climate.
        </h2>
        <p style={{ fontSize: 15, color: COLORS.text, lineHeight: 1.7, margin: "0 0 16px" }}>
          Most operators, investors, and analysts track <strong style={{ color: COLORS.orange }}>events</strong> — "Iran closed the Strait," 
          "Brent hit $85," "OPEC announced 206K bpd increase." Events are loud, sudden, and they dominate 
          every headline. They trigger emotional responses. They're the thunderclap.
        </p>
        <p style={{ fontSize: 15, color: COLORS.text, lineHeight: 1.7, margin: "0 0 16px" }}>
          The rare operator who consistently outperforms — across bull markets, bear markets, and especially 
          during the violent transitions between them — tracks <strong style={{ color: COLORS.green }}>effects</strong>. Effects are what 
          actually changed in the physical world as a consequence of events. Not "Iran threatened closure" but 
          <em> "tanker transits collapsed from 138/day to 1/day."</em> Not "oil prices surged" but <em>"seven of twelve 
          P&I clubs canceled war risk coverage, removing insurance from 90% of the global fleet."</em>
        </p>
        <p style={{ fontSize: 15, color: COLORS.text, lineHeight: 1.7, margin: 0 }}>
          The difference sounds subtle. It is not. <strong style={{ color: COLORS.goldBright }}>It is the difference between reacting to noise and 
          reading the actual state of the system.</strong> And that distinction becomes the difference between life and death 
          during phase transitions — the moments when the rules themselves are changing.
        </p>
      </div>

      {/* Event vs Effect visual */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 1fr", gap: 0, marginBottom: 28 }}>
        {/* Events column */}
        <div style={{
          background: `linear-gradient(180deg, ${COLORS.redDim}22 0%, ${COLORS.surface} 100%)`,
          border: `1px solid ${COLORS.redDim}`,
          borderRadius: "12px 0 0 12px",
          padding: 24,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: COLORS.red, fontWeight: 700, marginBottom: 12 }}>
            ⚡ EVENTS (WHAT MOST PEOPLE TRACK)
          </div>
          {[
            "\"Iran closed the Strait of Hormuz\"",
            "\"Oil prices surged 15%\"",
            "\"OPEC+ agreed to increase production\"",
            "\"US launched Operation Epic Fury\"",
            "\"Markets in turmoil — Nikkei down 6.65%\"",
            "\"Analysts predict $100-200 oil\"",
          ].map((e, i) => (
            <div key={i} style={{
              padding: "8px 12px",
              margin: "6px 0",
              background: `${COLORS.red}10`,
              border: `1px solid ${COLORS.red}20`,
              borderRadius: 6,
              fontSize: 13,
              color: COLORS.textDim,
              fontStyle: "italic",
            }}>{e}</div>
          ))}
          <div style={{ marginTop: 16, padding: "12px", background: `${COLORS.red}15`, borderRadius: 8, fontSize: 12, color: COLORS.textDim, lineHeight: 1.6 }}>
            Events are <strong style={{ color: COLORS.red }}>narration</strong>. They tell you a story happened. 
            They don't tell you how much the story actually changed the physical world. 
            Two events that sound identical can have completely different effects.
          </div>
        </div>

        {/* Arrow */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.surface }}>
          <div style={{ fontSize: 24, color: COLORS.gold }}>→</div>
        </div>

        {/* Effects column */}
        <div style={{
          background: `linear-gradient(180deg, ${COLORS.greenDim}22 0%, ${COLORS.surface} 100%)`,
          border: `1px solid ${COLORS.greenDim}`,
          borderRadius: "0 12px 12px 0",
          padding: 24,
        }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: COLORS.green, fontWeight: 700, marginBottom: 12 }}>
            ◉ EFFECTS (WHAT ACTUALLY CHANGED)
          </div>
          {[
            { text: "Tanker AIS signals: 138/day → 1 → 0", severity: "critical" },
            { text: "7/12 P&I clubs withdrew coverage (90% of fleet)", severity: "critical" },
            { text: "VLCC rates: $218K → $424K/day (all-time record)", severity: "high" },
            { text: "150+ vessels physically stranded in transit", severity: "high" },
            { text: "OPEC+ added 206K bpd (0.2% of demand — noise)", severity: "low" },
            { text: "QatarEnergy declared force majeure (20% global LNG)", severity: "critical" },
          ].map((e, i) => (
            <div key={i} style={{
              padding: "8px 12px",
              margin: "6px 0",
              background: `${e.severity === "critical" ? COLORS.green : e.severity === "high" ? COLORS.blue : COLORS.textMuted}15`,
              border: `1px solid ${e.severity === "critical" ? COLORS.green : e.severity === "high" ? COLORS.blue : COLORS.textMuted}30`,
              borderRadius: 6,
              fontSize: 13,
              color: COLORS.text,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: e.severity === "critical" ? COLORS.red : e.severity === "high" ? COLORS.orange : COLORS.textMuted,
                flexShrink: 0,
              }} />
              {e.text}
            </div>
          ))}
          <div style={{ marginTop: 16, padding: "12px", background: `${COLORS.green}15`, borderRadius: 8, fontSize: 12, color: COLORS.textDim, lineHeight: 1.6 }}>
            Effects are <strong style={{ color: COLORS.green }}>measurement</strong>. They tell you what physically moved. 
            Insurance withdrawal is binary — either ships can sail insured or they can't. 
            Tanker counts are countable. These are the <strong style={{ color: COLORS.green }}>condition:states</strong> of the system.
          </div>
        </div>
      </div>

      {/* Phase transition explanation */}
      <div style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "28px 32px",
        marginBottom: 28,
      }}>
        <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: COLORS.gold, margin: "0 0 14px" }}>
          Why This Matters Most During Phase Transitions
        </h3>
        <p style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.7, margin: "0 0 14px" }}>
          A <strong style={{ color: COLORS.goldBright }}>phase transition</strong> is the technical term for when the rules of the game 
          change — not a bad day, not volatility, but a genuine shift in what "normal" means. Water doesn't 
          get progressively colder until it freezes. It's liquid, liquid, liquid… then <em>solid</em>. The transition is 
          sudden, nonlinear, and it changes every property of the substance. You can't navigate ice with a boat.
        </p>
        <p style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.7, margin: "0 0 14px" }}>
          Energy markets work the same way. For 50 years, the Strait of Hormuz was an open shipping lane — 
          a background assumption so deeply embedded that nobody priced it. Then, in 72 hours, it became impassable. 
          The "map" that every trader, insurer, and logistics company was using became <em>wrong</em>. Not slightly wrong. 
          Categorically wrong. The geometry of the market — what's cheap, what's expensive, what's safe, what's risky — 
          inverted completely.
        </p>

        {/* Visual: phase diagram */}
        <div style={{
          display: "flex",
          alignItems: "stretch",
          gap: 0,
          marginTop: 20,
          borderRadius: 8,
          overflow: "hidden",
          border: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ flex: 1, padding: "16px 20px", background: `${COLORS.blue}15` }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: COLORS.blue, fontWeight: 700, marginBottom: 8 }}>
              STABLE STATE: "RISK-ON"
            </div>
            <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.6 }}>
              Hormuz open · Insurance normal · VLCC $20-40K/day · Brent $65-72 · 
              Model: optimize for cost efficiency, lean inventories, just-in-time delivery
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.blue }}>
              ← The "map" everyone was using
            </div>
          </div>
          <div style={{
            width: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: `linear-gradient(180deg, ${COLORS.red}40, ${COLORS.orange}40)`,
            padding: "12px 8px",
          }}>
            <div style={{ fontSize: 10, color: COLORS.goldBright, fontWeight: 700, textAlign: "center", letterSpacing: 1 }}>
              BOUNDARY<br/>LAYER
            </div>
            <div style={{ fontSize: 18, color: COLORS.goldBright, margin: "4px 0" }}>⚡</div>
            <div style={{ fontSize: 9, color: COLORS.textDim, textAlign: "center" }}>
              Feb 28 –<br/>Now
            </div>
          </div>
          <div style={{ flex: 1, padding: "16px 20px", background: `${COLORS.red}15` }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: COLORS.red, fontWeight: 700, marginBottom: 8 }}>
              NEW STATE: "CRISIS REGIME"
            </div>
            <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.6 }}>
              Hormuz closed · No insurance · VLCC $424K/day · Brent $83-85+ · 
              Model: optimize for supply security, long inventory, domestic production
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: COLORS.red }}>
              The new "map" →
            </div>
          </div>
        </div>

        <p style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.7, margin: "20px 0 0" }}>
          Here's the key: <strong style={{ color: COLORS.goldBright }}>the event-tracker is always late to a phase transition, 
          and the effect-tracker is always early.</strong> The event-tracker waited for the headline "Iran closes Strait." 
          The effect-tracker was already watching tanker AIS counts drop from 138 to 47 to 1 — 
          <em>before</em> any formal announcement — and positioning accordingly. The effect-tracker doesn't need 
          the announcement. The physical world already told the story.
        </p>
      </div>

      {/* Gini trajectory simplified */}
      <div style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.goldDim}`,
        borderRadius: 12,
        padding: "28px 32px",
      }}>
        <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: COLORS.gold, margin: "0 0 14px" }}>
          The One Question That Separates Transient Shocks from Structural Shifts
        </h3>
        <p style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.7, margin: "0 0 16px" }}>
          When a crisis hits, every indicator spikes. Oil, gold, VIX, freight rates — everything moves at once. 
          The critical question isn't <em>"how much did things move?"</em> It's: <strong style={{ color: COLORS.goldBright }}>are the signals 
          consolidating or dispersing?</strong>
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div style={{ padding: 20, background: `${COLORS.green}10`, borderRadius: 8, border: `1px solid ${COLORS.green}30` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.green, marginBottom: 8 }}>
              DISPERSING → TRANSIENT SHOCK
            </div>
            <div style={{ fontSize: 13, color: COLORS.textDim, lineHeight: 1.6 }}>
              Oil spikes but insurance stays. Tankers reroute but still transit. VLCC rates rise but from available capacity. 
              VIX spikes then falls within days. <strong style={{ color: COLORS.text }}>The signals disagree with each other.</strong> 
              Some say crisis, others say business as usual. This was June 2025 — the Israel-Iran 12-day war. Oil barely moved. 
              Event was terrifying; effects were minimal.
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", background: `${COLORS.green}20`, borderRadius: 6, fontSize: 12, color: COLORS.green }}>
              Regime classification: Negative Gini trajectory. Signal dispersion indicates transient perturbation, not state change.
            </div>
          </div>
          <div style={{ padding: 20, background: `${COLORS.red}10`, borderRadius: 8, border: `1px solid ${COLORS.red}30` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.red, marginBottom: 8 }}>
              CONSOLIDATING → STRUCTURAL SHIFT
            </div>
            <div style={{ fontSize: 13, color: COLORS.textDim, lineHeight: 1.6 }}>
              Oil spikes AND insurance withdraws AND tankers stop AND freight hits records AND LNG goes force majeure. 
              <strong style={{ color: COLORS.text }}>Every independent indicator points the same direction.</strong> 
              The signals are hierarchicalizing — fewer and fewer alternative explanations survive. 
              This is March 2026. Every physical metric confirms disruption.
            </div>
            <div style={{ marginTop: 10, padding: "8px 12px", background: `${COLORS.red}20`, borderRadius: 6, fontSize: 12, color: COLORS.red }}>
              Regime classification: Positive Gini trajectory. Signal consolidation indicates genuine phase transition in progress.
            </div>
          </div>
        </div>

        <p style={{ fontSize: 13, color: COLORS.textDim, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
          In the formal framework, this is called tracking the "Gini trajectory over Betti count" — 
          measuring whether the dominant signals are absorbing the lesser ones (consolidation) or 
          fragmenting into noise (dispersion). You don't need the math. You need the habit of asking: 
          <strong style={{ color: COLORS.gold }}> "Are independent systems all telling me the same thing?"</strong>
        </p>
      </div>
    </div>
  );
}

// ─── TRACKING NODES TAB ────────────────────────────────────
function NodesTab() {
  const [expanded, setExpanded] = useState(null);
  
  const categories = [
    {
      id: "kernel",
      title: "THE KERNEL CONDITION",
      subtitle: "Insurance — the one indicator that gates everything else",
      color: COLORS.red,
      description: "Insurance is the kernel condition of global maritime trade. It's binary: either ships can sail with coverage, or they can't. When 7 of 12 P&I clubs pulled war risk coverage on March 3, they didn't just raise prices — they made it functionally illegal for most vessels to enter the Persian Gulf. No owner will risk an uninsured $150M VLCC. This single effect-indicator tells you more about the real state of the crisis than every news headline combined.",
      nodes: [
        { name: "P&I Club Status", current: "7/12 clubs withdrawn", signal: "critical", detail: "Gard, Skuld, NorthStandard, London, American Club, Steamship Mutual, Swedish Club — all out effective March 5. Covers ~90% of global fleet." },
        { name: "War Risk Premium Rate", current: "Effectively infinite", signal: "critical", detail: "No price available for remaining clubs. Market for coverage has ceased to function." },
        { name: "Reinsurance Market", current: "Suspended", signal: "critical", detail: "Munich Re, Swiss Re, Lloyd's syndicates have suspended Gulf coverage pending military assessment." },
      ],
      watchFor: "Phase transition signal: P&I club reinstatement. When insurers return, vessel transits follow within 48-72 hours. This is the leading indicator — all other recovery signals lag behind it."
    },
    {
      id: "physical",
      title: "PHYSICAL FLOW INDICATORS",
      subtitle: "What's actually moving (or not moving) in the real world",
      color: COLORS.orange,
      description: "Physical flows can't be faked, spun, or reinterpreted. A tanker either transited the Strait or it didn't. AIS transponder data, port arrivals, and pipeline nominations are the ground truth of energy markets.",
      nodes: [
        { name: "Daily Tanker Transits (AIS)", current: "0 signals March 2", signal: "critical", detail: "From 138/day January average. Single most dramatic metric — 100% collapse in 72 hours." },
        { name: "Stranded Vessel Count", current: "150+", signal: "high", detail: "Vessels in transit at time of closure. Each represents cargo, insurance claims, and supply chain disruption." },
        { name: "Bypass Pipeline Utilization", current: "~50% capacity used", signal: "moderate", detail: "East-West Petroline (5M bpd capacity) + ADCOP (1.5M bpd) = 6.5M total vs. 15M+ normally transiting. Gap of 8.5M+ bpd cannot be bypassed." },
        { name: "VLCC Spot Rates", current: "$423,736/day (record)", signal: "critical", detail: "Previous record was ~$350K during COVID tanker storage boom. Rates reflect both supply disruption and vessel unavailability." },
        { name: "SPR Drawdown Status", current: "No release announced", signal: "watch", detail: "411-415M barrels in reserve. Max drawdown 4.4M bpd for 90 days. Watch for coordinated IEA release announcement." },
      ],
      watchFor: "Phase transition signal: First confirmed tanker transit through the Strait AND first insurance-backed cargo loading at Ras Tanura or Juaymah terminal. Both conditions must be met — one without the other is incomplete state change."
    },
    {
      id: "price",
      title: "PRICE ARCHITECTURE",
      subtitle: "The shape of the curve tells you what the market believes about duration",
      color: COLORS.blue,
      description: "The absolute price of oil tells you less than the structure of the forward curve. Backwardation (prompt prices above future prices) means the market believes the shortage is temporary. A flattening curve means it's becoming structural. The spread between WTI and Brent tells you about US isolation vs global exposure.",
      nodes: [
        { name: "Brent Front-Month", current: "~$83-85/bbl", signal: "high", detail: "Up 15-17% from $72 pre-strike. Still below $100 — market is pricing 2-4 week resolution." },
        { name: "WTI Cushing", current: "~$76/bbl", signal: "moderate", detail: "Brent-WTI spread widened to $7+ (from $4). US crude insulated but not immune." },
        { name: "WTI Forward Curve Shape", current: "Steep backwardation", signal: "high", detail: "Prompt $76 declining to $65 Dec 2026. Market consensus prices temporary disruption. Curve flattening at elevated levels would indicate shift to 'new normal' consensus." },
        { name: "Kansas Common Posted", current: "~$60-68/bbl (est.)", signal: "moderate", detail: "Typically $13-14 discount to WTI Cushing. Pre-crisis: $53.85. Post-crisis estimate reflects WTI pass-through." },
        { name: "OVX (Oil Volatility Index)", current: "63-69 (96th percentile)", signal: "high", detail: "Options market pricing extreme uncertainty. Both hedging cost and hedge value elevated simultaneously." },
      ],
      watchFor: "Regime signal: Curve flattening at elevated levels (backwardation collapse) = market consensus shifting from 'temporary disruption' to 'new normal.' This is the structural price signal — distinct from spot price movement."
    },
    {
      id: "domestic",
      title: "US DOMESTIC SUPPLY RESPONSE",
      subtitle: "Structural capacity constraints in the US production response",
      color: COLORS.purple,
      description: "The US shale machine — the world's swing producer — is structurally constrained. Rig counts are down 33% from 2022 peaks. DUC (drilled uncompleted) inventories are at operational minimums. Even at $100 oil, it takes 6-9 months to meaningfully increase production. This inelasticity is the structural condition facing all existing domestic producers.",
      nodes: [
        { name: "Baker Hughes Oil Rig Count", current: "409 rigs (-7% YoY)", signal: "moderate", detail: "Down from 610 at Dec 2022 peak. 33% decline. No meaningful response yet to Hormuz." },
        { name: "DUC Inventory (Permian)", current: "~878 (halved from 2024)", signal: "high", detail: "Near operational minimum. Industry has been completing DUCs faster than drilling new ones for 18 months." },
        { name: "US Production Forecast", current: "13.5M bpd → declining", signal: "moderate", detail: "EIA forecasts first annual production decline since 2021. This is structural, not price-responsive." },
        { name: "Frac Crew Availability", current: "Tight", signal: "moderate", detail: "Frac spread count has not increased with prices. Labor and equipment constraints limit response." },
      ],
      watchFor: "Regime signal: Rig count crossing above 450 oil rigs indicates meaningful supply response activation. Below 450, production declines continue regardless of price — structural inelasticity condition persists."
    },
  ];

  return (
    <div style={{ padding: "32px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, color: COLORS.gold, margin: "0 0 8px" }}>
          Primary Tracking Nodes
        </h2>
        <p style={{ fontSize: 14, color: COLORS.textDim, lineHeight: 1.6, margin: 0 }}>
          These are the effect-indicators that describe the real state of the system. They're organized by 
          causal hierarchy — insurance gates physical flows, which drive prices, which determine domestic economics.
        </p>
      </div>

      {categories.map((cat, ci) => (
        <div key={cat.id} style={{
          marginBottom: 16,
          border: `1px solid ${expanded === cat.id ? cat.color + "60" : COLORS.border}`,
          borderRadius: 12,
          overflow: "hidden",
          background: COLORS.surface,
          transition: "border-color 0.3s",
        }}>
          {/* Category header */}
          <div
            onClick={() => setExpanded(expanded === cat.id ? null : cat.id)}
            style={{
              padding: "18px 24px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: expanded === cat.id ? `${cat.color}08` : "transparent",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                <span style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: `${cat.color}20`, border: `2px solid ${cat.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 800, color: cat.color,
                }}>
                  {ci + 1}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, letterSpacing: 0.5 }}>
                  {cat.title}
                </span>
              </div>
              <span style={{ fontSize: 12, color: COLORS.textDim, marginLeft: 40 }}>
                {cat.subtitle}
              </span>
            </div>
            <div style={{
              fontSize: 11, color: COLORS.textMuted, padding: "4px 10px",
              border: `1px solid ${COLORS.border}`, borderRadius: 4,
            }}>
              {cat.nodes.filter(n => n.signal === "critical").length > 0 && (
                <span style={{ color: COLORS.red, marginRight: 6 }}>
                  ● {cat.nodes.filter(n => n.signal === "critical").length} CRITICAL
                </span>
              )}
              {expanded === cat.id ? "▼" : "▶"}
            </div>
          </div>

          {/* Expanded content */}
          {expanded === cat.id && (
            <div style={{ padding: "0 24px 24px", borderTop: `1px solid ${COLORS.border}` }}>
              <p style={{ fontSize: 13, color: COLORS.textDim, lineHeight: 1.6, margin: "16px 0" }}>
                {cat.description}
              </p>
              
              {cat.nodes.map((node, ni) => (
                <div key={ni} style={{
                  display: "grid",
                  gridTemplateColumns: "200px 220px 1fr",
                  gap: 16,
                  padding: "12px 16px",
                  margin: "4px 0",
                  background: `${node.signal === "critical" ? COLORS.red : node.signal === "high" ? COLORS.orange : COLORS.textMuted}08`,
                  borderRadius: 8,
                  borderLeft: `3px solid ${node.signal === "critical" ? COLORS.red : node.signal === "high" ? COLORS.orange : node.signal === "moderate" ? COLORS.blue : COLORS.textMuted}`,
                  alignItems: "center",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{node.name}</div>
                  <div style={{
                    fontSize: 12, fontWeight: 700,
                    color: node.signal === "critical" ? COLORS.red : node.signal === "high" ? COLORS.orange : COLORS.blue,
                  }}>
                    {node.current}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.5 }}>{node.detail}</div>
                </div>
              ))}

              <div style={{
                marginTop: 16, padding: "12px 16px",
                background: `${COLORS.gold}10`, borderRadius: 8,
                borderLeft: `3px solid ${COLORS.gold}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.gold, letterSpacing: 1, marginBottom: 4 }}>
                  ◉ BOUNDARY LAYER INDICATOR
                </div>
                <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6 }}>
                  {cat.watchFor}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── PORTFOLIO TAB ─────────────────────────────────────────
function PortfolioTab() {
  const plotContainerRef = useRef(null);
  const [plotWidth, setPlotWidth] = useState(900);

  useEffect(() => {
    const el = plotContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setPlotWidth(Math.max(200, width - 80)); // subtract left(60) + right(20) padding
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const prospects = [
    {
      name: "Arbuckle\nButler Co., KS",
      risk: 15, reward: 25, size: 44,
      color: COLORS.green,
      depth: "2,300-2,500 ft",
      wellCost: "$175-275K",
      eur: "50-75K bbl",
      breakeven: "$25-35/bbl",
      role: "SHALLOW CONVENTIONAL — PROVEN",
      desc: "Century-old field, shallow wells, 15+ stacked pay horizons. El Dorado field: 300M+ bbl cumulative. Waterflood F&D costs $1-3/bbl in adjacent zones. CO₂ EOR potential: KGS estimates 440-660M additional bbl recoverable. HF Sinclair refinery (135K bbl/d) provides local crude market.",
    },
    {
      name: "Morrow\nFinney/Gray Co., KS",
      risk: 35, reward: 55, size: 50,
      color: COLORS.blue,
      depth: "4,700-4,800 ft",
      wellCost: "$400-800K",
      eur: "150-200K bbl",
      breakeven: "$35-45/bbl",
      role: "CHANNEL SAND — DEVELOPMENT",
      desc: "Proven reservoir quality (16% porosity, 138 md perm) in incised valley-fill sandstones. EUR 150-200K bbl/well. Stewart Field analog: 7M+ bbl cumulative, recovery 11.5% primary → 32% with CO₂ WAG. Reservoir highly lenticular — 30-40 ft in channel axis, absent at offsets. Seismic required to map valley-fill trends.",
    },
    {
      name: "Trenton\nRoss Co., OH",
      risk: 75, reward: 45, size: 32,
      color: COLORS.orange,
      depth: "1,500-3,000 ft",
      wellCost: "$200-500K",
      eur: "Unknown — Wildcat",
      breakeven: "$40-55/bbl (if productive)",
      role: "RANK WILDCAT — FRONTIER",
      desc: "Zero recorded production in Ross County. 101 historical wells, none active. Commercial Trenton production elsewhere requires hydrothermal dolomite (HTD) creating vuggy secondary porosity along basement faults. Without HTD, matrix porosity <3% (non-commercial). Point Pleasant source rock thickest in southern Ohio (favorable). Seismic identification of sag features / fault zones required before drilling.",
    },
    {
      name: "Pearsall\nSouth Texas",
      risk: 55, reward: 95, size: 60,
      color: COLORS.gold,
      depth: "7,000-10,400 ft",
      wellCost: "$8-12M",
      eur: "200-300K bbl (Formentera analog)",
      breakeven: "$60-70/bbl",
      role: "UNCONVENTIONAL — EMERGING PLAY",
      desc: "Formentera Partners 2025 Frio County results: Hurrikain 1,499 bbl/d + 4 MMcf/d IP; Darlene 1,282 bbl/d + 2.9 MMcf/d IP. Modern high-intensity completions (2,000-3,000 lb proppant/ft) unlocked formation previously dismissed as 'heartbreak shale.' EOG Resources entered play (Burns Ranch #1H wildcat). Overpressured, 3,000 ft below Eagle Ford — narrow drilling margin between pore pressure and fracture gradient. Multi-bench stacking: Austin Chalk + Eagle Ford + Pearsall.",
    },
  ];

  return (
    <div style={{ padding: "32px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, color: COLORS.gold, margin: "0 0 8px" }}>
          Portfolio Architecture: The Risk Ladder
        </h2>
        <p style={{ fontSize: 14, color: COLORS.textDim, lineHeight: 1.6, margin: 0 }}>
          Each prospect occupies a distinct position on the risk-reward surface. The portfolio spans 
          2,300 ft (Arbuckle) to 10,400 ft (Pearsall), three states, conventional and unconventional, 
          oil and gas windows. The geometry below shows where each asset sits relative to the others — 
          depth, cost, EUR, and breakeven economics at current posted prices.
        </p>
      </div>

      {/* Risk-Reward scatter */}
      <div ref={plotContainerRef} style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "24px",
        marginBottom: 24,
        position: "relative",
        height: 320,
      }}>
        <div style={{ position: "absolute", top: 8, left: 24, fontSize: 10, color: COLORS.textMuted, letterSpacing: 1 }}>
          RISK-REWARD POSITIONING
        </div>
        {/* Axes */}
        <div style={{ position: "absolute", bottom: 20, left: 60, right: 20, height: 1, background: COLORS.border }} />
        <div style={{ position: "absolute", bottom: 20, left: 60, top: 30, width: 1, background: COLORS.border }} />
        <div style={{ position: "absolute", bottom: 4, left: "50%", fontSize: 10, color: COLORS.textMuted }}>RISK →</div>
        <div style={{ position: "absolute", left: 8, top: "40%", fontSize: 10, color: COLORS.textMuted, transform: "rotate(-90deg)", transformOrigin: "left center" }}>REWARD →</div>
        
        {/* Grid lines */}
        {[25, 50, 75].map(v => (
          <div key={`h${v}`} style={{
            position: "absolute",
            bottom: 20 + (v / 100) * 250,
            left: 60, right: 20,
            height: 0,
            borderTop: `1px dashed ${COLORS.border}60`,
          }} />
        ))}
        {[25, 50, 75].map(v => (
          <div key={`v${v}`} style={{
            position: "absolute",
            left: 60 + (v / 100) * plotWidth,
            bottom: 20, top: 30,
            width: 1,
            background: `${COLORS.border}60`,
          }} />
        ))}

        {/* Prospect dots */}
        {prospects.map((p, i) => {
          const plotHeight = 250;
          const x = 60 + (p.risk / 100) * plotWidth;
          const y = 270 - (p.reward / 100) * plotHeight;
          return (
            <div key={i} style={{
              position: "absolute",
              left: x - p.size / 2,
              top: y - p.size / 2,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: `${p.color}30`,
              border: `2px solid ${p.color}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
            }}>
              <div style={{
                position: "absolute",
                top: p.size + 4,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 10,
                color: p.color,
                fontWeight: 600,
                whiteSpace: "pre-line",
                textAlign: "center",
                lineHeight: 1.3,
              }}>
                {p.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Prospect cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {prospects.map((p, i) => (
          <div key={i} style={{
            background: COLORS.surface,
            border: `1px solid ${p.color}30`,
            borderRadius: 12,
            padding: "20px 24px",
            borderTop: `3px solid ${p.color}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: p.color }}>{p.name.replace(/\n/g, " — ")}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                padding: "3px 8px", borderRadius: 4,
                background: `${p.color}15`, color: p.color,
              }}>
                {p.role}
              </span>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginBottom: 12 }}>
              {[
                ["Depth", p.depth],
                ["Well Cost", p.wellCost],
                ["EUR", p.eur],
                ["Breakeven", p.breakeven],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: COLORS.textMuted }}>{label}</span>
                  <span style={{ fontSize: 11, color: COLORS.text, fontWeight: 600 }}>{val}</span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.6, margin: 0 }}>
              {p.desc}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EFFECT CHAINS TAB ──────────────────────────────────────
function PlaybookTab() {
  return (
    <div style={{ padding: "32px", maxWidth: 1100 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, color: COLORS.gold, margin: "0 0 8px" }}>
          Effect Chains: How Condition:States Cascade
        </h2>
        <p style={{ fontSize: 14, color: COLORS.textDim, lineHeight: 1.6, margin: 0 }}>
          Effects don't exist in isolation. They propagate through causal chains — each changed condition:state 
          alters the boundary conditions for the next. The maps below show the objective structure of how 
          effects move through the system. The geometry is the same whether oil is $40 or $140.
        </p>
      </div>

      {/* Effect cascade chains */}
      {[
        {
          title: "MARITIME INSURANCE → PHYSICAL FLOW CASCADE",
          icon: "◈",
          chain: [
            { state: "P&I clubs withdraw war risk coverage", classification: "KERNEL", color: COLORS.red, downstream: "Removes legal basis for vessel transit. No owner exposes uninsured $150M hull to combat zone." },
            { state: "Tanker AIS transits collapse (138/day → 0)", classification: "PRIMARY EFFECT", color: COLORS.red, downstream: "15-17M bpd of crude, condensate, and LNG physically stops moving through the chokepoint." },
            { state: "VLCC spot rates hit all-time record ($424K/day)", classification: "SECONDARY EFFECT", color: COLORS.orange, downstream: "Remaining global vessel capacity reprices. Cape of Good Hope routing adds 10-14 days and $3-5M per voyage." },
            { state: "QatarEnergy declares force majeure on LNG contracts", classification: "TERTIARY EFFECT", color: COLORS.orange, downstream: "20% of global LNG supply enters contractual suspension. European and Asian gas markets decouple from spot." },
            { state: "SPR / IEA coordinated release enters consideration", classification: "POLICY RESPONSE", color: COLORS.blue, downstream: "411-415M barrel reserve. Max drawdown 4.4M bpd for 90 days. Covers ~25-30% of lost Hormuz flow." },
          ]
        },
        {
          title: "PRICE ARCHITECTURE → DOMESTIC ECONOMICS CASCADE",
          icon: "◆",
          chain: [
            { state: "Brent-WTI spread widens to $7+ (from $4 pre-crisis)", classification: "PRICE STRUCTURE", color: COLORS.blue, downstream: "US crude relatively insulated from global shock. Domestic barrels gain competitive advantage vs waterborne imports." },
            { state: "WTI forward curve enters steep backwardation", classification: "DURATION SIGNAL", color: COLORS.blue, downstream: "Market consensus: disruption is temporary (2-4 weeks). Prompt premium declining to $65 by Dec 2026. Curve shape encodes collective belief about resolution timeline." },
            { state: "Kansas Common posted price rises to ~$60-68/bbl (from $53.85)", classification: "BASIN ECONOMICS", color: COLORS.green, downstream: "WTI pass-through minus $13-14 transportation differential. Conventional Kansas well breakevens ($25-45/bbl) move deep into positive margin territory." },
            { state: "Eagle Ford netback improves to ~$73-78/bbl", classification: "BASIN ECONOMICS", color: COLORS.green, downstream: "Gulf Coast pipeline access and Corpus Christi export proximity capture tighter differential ($2-4 discount to Cushing). Pearsall breakeven ($60-70/bbl) crosses viability threshold." },
            { state: "OVX reaches 96th percentile (63-69)", classification: "VOLATILITY REGIME", color: COLORS.orange, downstream: "Options market prices extreme uncertainty. Hedging cost and hedging value both elevated simultaneously." },
          ]
        },
        {
          title: "SUPPLY INELASTICITY → STRUCTURAL CONSTRAINT CASCADE",
          icon: "◉",
          chain: [
            { state: "Baker Hughes oil rig count: 409 (-33% from 2022 peak)", classification: "CAPACITY", color: COLORS.purple, downstream: "Physical drilling activity insufficient to offset base decline rates. No meaningful rig response to price signal yet." },
            { state: "DUC inventory halved to ~878 (operational minimum)", classification: "BUFFER EXHAUSTION", color: COLORS.purple, downstream: "Industry has been completing DUCs faster than drilling new wells for 18 months. The backlog that historically absorbed price shocks is depleted." },
            { state: "EIA forecasts first US production decline since 2021", classification: "STRUCTURAL SHIFT", color: COLORS.red, downstream: "This is not price-responsive. Even at $100 WTI, 6-9 months minimum before meaningful production additions. The supply machine is structurally constrained." },
            { state: "Frac crew availability: tight, spread count flat", classification: "LABOR/EQUIPMENT", color: COLORS.orange, downstream: "Service sector has not rebuilt capacity shed during 2023-2024 downturn. Equipment and labor constraints limit theoretical response rate." },
          ]
        },
      ].map((section, si) => (
        <div key={si} style={{
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 12,
          padding: "24px 28px",
          marginBottom: 20,
        }}>
          <h3 style={{
            fontSize: 14, fontWeight: 700, color: COLORS.gold,
            letterSpacing: 1, margin: "0 0 16px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>{section.icon}</span>
            {section.title}
          </h3>
          
          {section.chain.map((link, li) => (
            <div key={li} style={{ display: "flex", gap: 0, marginBottom: li < section.chain.length - 1 ? 0 : 0 }}>
              {/* Vertical connector */}
              <div style={{ width: 40, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: `${link.color}40`, border: `2px solid ${link.color}`,
                  flexShrink: 0, zIndex: 1,
                }} />
                {li < section.chain.length - 1 && (
                  <div style={{ width: 2, flex: 1, background: `${COLORS.border}`, minHeight: 20 }} />
                )}
              </div>
              
              {/* Content */}
              <div style={{
                flex: 1,
                padding: "8px 16px 16px",
                marginBottom: li < section.chain.length - 1 ? 4 : 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: 1,
                    padding: "2px 6px", borderRadius: 3,
                    background: `${link.color}15`, color: link.color,
                  }}>
                    {link.classification}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: COLORS.text, fontWeight: 600, marginBottom: 4, lineHeight: 1.4 }}>
                  {link.state}
                </div>
                <div style={{ fontSize: 12, color: COLORS.textDim, lineHeight: 1.6 }}>
                  ↳ {link.downstream}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* MPD as boundary layer phenomenon — objective, not prescriptive */}
      <div style={{
        background: `linear-gradient(135deg, ${COLORS.goldDim}15, ${COLORS.surface})`,
        border: `1px solid ${COLORS.goldDim}`,
        borderRadius: 12,
        padding: "28px 32px",
        marginBottom: 20,
      }}>
        <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: COLORS.gold, margin: "0 0 14px" }}>
          The Pearsall Boundary Layer: A Physical Analog
        </h3>
        <p style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.7, margin: "0 0 14px" }}>
          The Pearsall Shale sits 3,000 ft below the Eagle Ford — overpressured, beneath potentially depleted zones. 
          The drilling margin between pore pressure and fracture gradient narrows to as little as 0.5 ppg. 
          Conventional approaches use a single mud weight (a single "map") across the entire wellbore. 
          The wellbore passes through a literal <strong style={{ color: COLORS.goldBright }}>boundary layer</strong> — 
          a phase transition between pressure regimes where the rules change within feet.
        </p>
        <p style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.7, margin: "0 0 14px" }}>
          Managed pressure drilling maintains bottomhole pressure in real time using a closed-loop system with 
          surface back pressure as a third control variable. It navigates the boundary layer by reading the 
          actual condition:state of the wellbore — not the predicted state — and adjusting continuously. 
          The same principle at wellbore scale that effect-tracking applies at market scale.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
          {[
            { stat: "99.6%", label: "NPT reduction — BP offshore case", color: COLORS.green },
            { stat: "49%", label: "Drilling time reduction — Haynesville analog", color: COLORS.green },
            { stat: "0.05 sg", label: "Narrowest margin drilled (South China Sea HPHT)", color: COLORS.gold },
          ].map((s, i) => (
            <div key={i} style={{
              textAlign: "center", padding: "16px",
              background: `${s.color}10`, borderRadius: 8,
              border: `1px solid ${s.color}20`,
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: "'Playfair Display', Georgia, serif" }}>
                {s.stat}
              </div>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Closing frame — objective, not prescriptive */}
      <div style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "28px 32px",
      }}>
        <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 18, color: COLORS.gold, margin: "0 0 14px" }}>
          The Geometry Is the Same at Every Scale
        </h3>
        <p style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.7, margin: "0 0 14px" }}>
          A wellbore passing from depleted Eagle Ford into overpressured Pearsall. A global energy market 
          passing from open-Hormuz to closed-Hormuz. A portfolio passing from $54 Kansas Common to $68. 
          The structure is identical: stable state → boundary layer → new state. The condition:states change. 
          The geometry of what's connected to what rearranges. The old map stops working.
        </p>
        <p style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.7, margin: "0 0 14px" }}>
          Effect-tracking is reading the actual topology of the system — what's physically true right now — 
          rather than the narrative about what's true. Insurance status is binary. Tanker counts are countable. 
          Curve shape is observable. Rig counts are published. Bottomhole pressure is measured. 
          None of these require interpretation. All of them require attention.
        </p>
        <p style={{ fontSize: 14, color: COLORS.goldBright, lineHeight: 1.7, margin: 0, fontWeight: 500 }}>
          The framework doesn't tell you what to do. It tells you what's actually happening — 
          at every scale, in every regime, especially across the boundary layers where 
          the difference between seeing clearly and not seeing at all is the entire game.
        </p>
      </div>
    </div>
  );
}

// ─── SIGNAL MONITOR TAB ────────────────────────────────────
function SignalMonitorTab() {
  const [signals, setSignals] = useState(() =>
    SIGNALS.map(s => ({ ...s, lastUpdate: new Date() }))
  );
  const [filter, setFilter] = useState({ severity: "all", category: "all" });
  const [analyzerText, setAnalyzerText] = useState("");
  const [analysisResult, setAnalysisResult] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Tick every second so timestamps stay current
  useEffect(() => {
    const timerId = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timerId);
  }, []);

  // Simulated real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setSignals(prev => prev.map(s => {
        if (!s.jitter || !s.numeric) return { ...s, lastUpdate: new Date() };
        const delta = (Math.random() - 0.45) * s.jitter;
        const newNumeric = Math.max(0, s.numeric + delta);
        let formatted;
        if (s.id === "vlcc") formatted = "$" + Math.round(newNumeric).toLocaleString();
        else if (s.unit === "/bbl" || s.id === "spread") formatted = "$" + newNumeric.toFixed(2);
        else if (s.unit === "%") formatted = Math.round(newNumeric) + "%";
        else if (Number.isInteger(newNumeric)) formatted = String(newNumeric);
        else formatted = newNumeric.toFixed(1);
        const newSeverity = computeSeverity(s.id, newNumeric, s.severity);
        return { ...s, numeric: newNumeric, value: formatted, severity: newSeverity, lastUpdate: new Date() };
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Compute coherence score: fraction of signals that are critical or high
  const criticalCount = signals.filter(s => s.severity === "critical").length;
  const highCount = signals.filter(s => s.severity === "high").length;
  const coherenceScore = Math.round(((criticalCount * 1.0 + highCount * 0.6) / signals.length) * 100);

  // Filter signals
  const filteredSignals = signals.filter(s => {
    if (filter.severity !== "all" && s.severity !== filter.severity) return false;
    if (filter.category !== "all" && s.category !== filter.category) return false;
    return true;
  });

  // Semantic analyzer
  const analyzeText = useCallback(() => {
    if (!analyzerText.trim()) return;
    const lower = analyzerText.toLowerCase();
    const effectHits = EFFECT_KEYWORDS.filter(k => lower.includes(k));
    const eventHits = EVENT_KEYWORDS.filter(k => lower.includes(k));
    const totalHits = effectHits.length + eventHits.length;
    const score = totalHits > 0 ? (effectHits.length - eventHits.length) / totalHits : 0;

    // Map to effect chains
    const chainMap = [];
    const insuranceTerms = ["insurance", "p&i", "coverage", "withdrawn", "reinsurance", "premium"];
    const physicalTerms = ["transit", "ais", "tanker", "vessel", "stranded", "vlcc", "freight", "pipeline"];
    const priceTerms = ["brent", "wti", "spread", "backwardation", "curve", "netback", "breakeven", "ovx"];
    const supplyTerms = ["rig count", "duc", "production", "bpd", "capacity", "frac"];
    if (insuranceTerms.some(t => lower.includes(t))) chainMap.push("Maritime Insurance Cascade");
    if (physicalTerms.some(t => lower.includes(t))) chainMap.push("Physical Flow Cascade");
    if (priceTerms.some(t => lower.includes(t))) chainMap.push("Price Architecture Cascade");
    if (supplyTerms.some(t => lower.includes(t))) chainMap.push("Supply Constraint Cascade");

    setAnalysisResult({
      classification: score > 0.2 ? "EFFECT" : score < -0.2 ? "EVENT" : "MIXED",
      score,
      effectHits,
      eventHits,
      chainMap,
      confidence: totalHits > 0 ? Math.min(100, Math.round((totalHits / 5) * 100)) : 0,
    });
  }, [analyzerText]);

  const severityColor = (sev) =>
    sev === "critical" ? COLORS.red : sev === "high" ? COLORS.orange : sev === "moderate" ? COLORS.blue : COLORS.textMuted;

  const trendArrow = (t) =>
    t === "up" ? "▲" : t === "down" ? "▼" : "■";

  const formatTime = (d) => {
    const s = Math.floor((now - d) / 1000);
    return s < 5 ? "just now" : s + "s ago";
  };

  // Regime label
  const regimeLabel = coherenceScore >= 75 ? "CRISIS REGIME" : coherenceScore >= 50 ? "TRANSITION" : "STABLE";
  const regimeColor = coherenceScore >= 75 ? COLORS.red : coherenceScore >= 50 ? COLORS.orange : COLORS.green;

  return (
    <div style={{ padding: "32px", maxWidth: 1200 }}>
      {/* ── SYSTEM STATUS HEADER ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 24,
      }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, color: COLORS.gold, margin: "0 0 6px" }}>
            Signal Monitor
          </h2>
          <p style={{ fontSize: 13, color: COLORS.textDim, margin: 0, lineHeight: 1.5 }}>
            Real-time condition:state tracking across all effect-indicators. Signals update continuously.
            Coherence measures whether independent indicators agree — consolidation indicates structural shift.
          </p>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 20px", borderRadius: 8,
          background: `${regimeColor}15`, border: `1px solid ${regimeColor}40`,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", background: regimeColor,
            boxShadow: `0 0 8px ${regimeColor}80`,
            animation: "pulse 2s infinite",
          }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: regimeColor, letterSpacing: 1.5 }}>{regimeLabel}</div>
            <div style={{ fontSize: 10, color: COLORS.textDim }}>System State</div>
          </div>
        </div>
      </div>

      {/* ── COHERENCE GAUGE + FILTER CONTROLS ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24,
      }}>
        {/* Coherence gauge */}
        <div style={{
          background: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: 12, padding: "20px 24px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: COLORS.gold, marginBottom: 12 }}>
            SIGNAL COHERENCE — GINI TRAJECTORY
          </div>
          <div style={{
            height: 24, borderRadius: 12, background: COLORS.bg, position: "relative", overflow: "hidden", marginBottom: 10,
          }}>
            <div style={{
              height: "100%", borderRadius: 12, width: coherenceScore + "%",
              background: `linear-gradient(90deg, ${COLORS.green}, ${COLORS.orange}, ${COLORS.red})`,
              transition: "width 0.5s ease",
            }} />
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: COLORS.text,
            }}>
              {coherenceScore}% CONSOLIDATION
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: COLORS.textMuted }}>
            <span>DISPERSING (transient)</span>
            <span>CONSOLIDATING (structural)</span>
          </div>
          <div style={{
            marginTop: 12, padding: "10px 14px", borderRadius: 6,
            background: `${regimeColor}10`, border: `1px solid ${regimeColor}25`,
            fontSize: 12, color: COLORS.textDim, lineHeight: 1.5,
          }}>
            {coherenceScore >= 75
              ? <>Positive Gini trajectory. <strong style={{ color: COLORS.red }}>{criticalCount} critical</strong> and <strong style={{ color: COLORS.orange }}>{highCount} high</strong> signals consolidating — independent systems confirm structural phase transition.</>
              : coherenceScore >= 50
                ? <>Intermediate coherence. Signals partially aligned — monitoring for consolidation or dispersion trend.</>
                : <>Negative Gini trajectory. Signals dispersing — current perturbation appears transient, not structural.</>
            }
          </div>
        </div>

        {/* Filter + summary */}
        <div style={{
          background: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: 12, padding: "20px 24px",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: COLORS.gold, marginBottom: 12 }}>
            NOISE FILTER
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 6, letterSpacing: 1 }}>BY SEVERITY</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["all", "critical", "high", "moderate", "watch"].map(sev => (
                <button key={sev} onClick={() => setFilter(f => ({ ...f, severity: sev }))} style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
                  cursor: "pointer", border: "1px solid", textTransform: "uppercase",
                  background: filter.severity === sev ? (sev === "all" ? COLORS.gold + "20" : severityColor(sev) + "25") : "transparent",
                  borderColor: filter.severity === sev ? (sev === "all" ? COLORS.gold : severityColor(sev)) : COLORS.border,
                  color: filter.severity === sev ? (sev === "all" ? COLORS.gold : severityColor(sev)) : COLORS.textMuted,
                }}>
                  {sev === "all" ? "ALL" : sev}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 6, letterSpacing: 1 }}>BY CATEGORY</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["all", "kernel", "physical", "price", "domestic"].map(cat => (
                <button key={cat} onClick={() => setFilter(f => ({ ...f, category: cat }))} style={{
                  padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
                  cursor: "pointer", border: "1px solid", textTransform: "uppercase",
                  background: filter.category === cat ? (cat === "all" ? COLORS.gold + "20" : CATEGORY_META[cat]?.color + "25") : "transparent",
                  borderColor: filter.category === cat ? (cat === "all" ? COLORS.gold : CATEGORY_META[cat]?.color) : COLORS.border,
                  color: filter.category === cat ? (cat === "all" ? COLORS.gold : CATEGORY_META[cat]?.color) : COLORS.textMuted,
                }}>
                  {cat === "all" ? "ALL" : CATEGORY_META[cat]?.label || cat}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const count = signals.filter(s => s.category === key).length;
              const criticals = signals.filter(s => s.category === key && s.severity === "critical").length;
              return (
                <div key={key} style={{
                  textAlign: "center", padding: "8px 4px", borderRadius: 6,
                  background: `${meta.color}10`, border: `1px solid ${meta.color}20`,
                }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: meta.color }}>{count}</div>
                  <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 0.5 }}>{meta.label}</div>
                  {criticals > 0 && (
                    <div style={{ fontSize: 9, color: COLORS.red, marginTop: 2 }}>{criticals} CRITICAL</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── LIVE SIGNAL GRID ── */}
      <div style={{
        background: COLORS.surface, border: `1px solid ${COLORS.border}`,
        borderRadius: 12, padding: "20px 24px", marginBottom: 24,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: COLORS.gold, marginBottom: 16 }}>
          LIVE CONDITION:STATES — {filteredSignals.length} SIGNALS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {filteredSignals.map(s => {
            const catMeta = CATEGORY_META[s.category];
            return (
              <div key={s.id} style={{
                padding: "14px 16px", borderRadius: 8,
                background: `${severityColor(s.severity)}08`,
                borderTop: `1px solid ${severityColor(s.severity)}20`,
                borderRight: `1px solid ${severityColor(s.severity)}20`,
                borderBottom: `1px solid ${severityColor(s.severity)}20`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 0.5 }}>{s.name}</span>
                  <span style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: 1,
                    padding: "1px 5px", borderRadius: 3,
                    background: `${severityColor(s.severity)}20`, color: severityColor(s.severity),
                  }}>
                    {s.severity.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: COLORS.text }}>{s.value}</span>
                  <span style={{ fontSize: 10, color: COLORS.textDim }}>{s.unit}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: s.trend === "up" ? COLORS.red : s.trend === "down" ? COLORS.green : COLORS.textMuted,
                  }}>
                    {trendArrow(s.trend)} {s.trend.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 9, color: COLORS.textMuted }}>{formatTime(s.lastUpdate)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SEMANTIC ANALYTICS ── */}
      <div style={{
        background: COLORS.surface, border: `1px solid ${COLORS.border}`,
        borderRadius: 12, padding: "20px 24px",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: COLORS.gold, marginBottom: 6 }}>
          SEMANTIC SIGNAL ANALYZER
        </div>
        <p style={{ fontSize: 12, color: COLORS.textDim, margin: "0 0 12px", lineHeight: 1.5 }}>
          Paste a headline, report excerpt, or data point below. The analyzer classifies the input as
          an <strong style={{ color: COLORS.green }}>effect</strong> (measurable change in the physical world) or
          an <strong style={{ color: COLORS.red }}>event</strong> (narrative, prediction, or sentiment) and maps it to the relevant effect chain.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <textarea
            value={analyzerText}
            onChange={e => setAnalyzerText(e.target.value)}
            placeholder="e.g., &quot;7 of 12 P&amp;I clubs withdrew war risk coverage, removing insurance from 90% of global fleet&quot;"
            style={{
              flex: 1, padding: "12px 14px", borderRadius: 8, fontSize: 13,
              background: COLORS.bg, border: `1px solid ${COLORS.border}`,
              color: COLORS.text, resize: "vertical", minHeight: 60,
              fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5,
            }}
          />
          <button onClick={analyzeText} style={{
            padding: "12px 24px", borderRadius: 8, fontSize: 11, fontWeight: 700,
            letterSpacing: 1, cursor: "pointer",
            background: `${COLORS.gold}20`, border: `1px solid ${COLORS.gold}`,
            color: COLORS.gold, alignSelf: "flex-start",
          }}>
            ANALYZE
          </button>
        </div>

        {analysisResult && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "stretch", marginBottom: 12 }}>
              {/* Classification badge */}
              <div style={{
                padding: "16px 24px", borderRadius: 8, textAlign: "center", minWidth: 140,
                background: `${analysisResult.classification === "EFFECT" ? COLORS.green : analysisResult.classification === "EVENT" ? COLORS.red : COLORS.orange}15`,
                border: `1px solid ${analysisResult.classification === "EFFECT" ? COLORS.green : analysisResult.classification === "EVENT" ? COLORS.red : COLORS.orange}40`,
              }}>
                <div style={{
                  fontSize: 18, fontWeight: 800, letterSpacing: 1,
                  color: analysisResult.classification === "EFFECT" ? COLORS.green : analysisResult.classification === "EVENT" ? COLORS.red : COLORS.orange,
                }}>
                  {analysisResult.classification}
                </div>
                <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>
                  {analysisResult.classification === "EFFECT" ? "SIGNAL" : analysisResult.classification === "EVENT" ? "NOISE" : "AMBIGUOUS"}
                </div>
              </div>

              {/* Confidence bar */}
              <div style={{ flex: 1, padding: "12px 16px", borderRadius: 8, background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8 }}>SIGNAL STRENGTH</div>
                <div style={{ height: 14, borderRadius: 7, background: `${COLORS.border}`, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 7,
                    width: analysisResult.confidence + "%",
                    background: analysisResult.classification === "EFFECT" ? COLORS.green : analysisResult.classification === "EVENT" ? COLORS.red : COLORS.orange,
                    transition: "width 0.3s",
                  }} />
                </div>
                <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4 }}>
                  {analysisResult.confidence}% confidence — {analysisResult.effectHits.length} effect terms, {analysisResult.eventHits.length} event terms detected
                </div>
              </div>
            </div>

            {/* Keyword highlights */}
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              {analysisResult.effectHits.length > 0 && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: COLORS.green, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>EFFECT TERMS</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {analysisResult.effectHits.map((k, i) => (
                      <span key={i} style={{
                        padding: "2px 8px", borderRadius: 4, fontSize: 11,
                        background: `${COLORS.green}15`, color: COLORS.green,
                        border: `1px solid ${COLORS.green}30`,
                      }}>{k}</span>
                    ))}
                  </div>
                </div>
              )}
              {analysisResult.eventHits.length > 0 && (
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: COLORS.red, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>EVENT TERMS</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {analysisResult.eventHits.map((k, i) => (
                      <span key={i} style={{
                        padding: "2px 8px", borderRadius: 4, fontSize: 11,
                        background: `${COLORS.red}15`, color: COLORS.red,
                        border: `1px solid ${COLORS.red}30`,
                      }}>{k}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Chain mapping */}
            {analysisResult.chainMap.length > 0 && (
              <div style={{
                padding: "10px 14px", borderRadius: 6,
                background: `${COLORS.gold}08`, border: `1px solid ${COLORS.gold}20`,
              }}>
                <div style={{ fontSize: 10, color: COLORS.gold, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>MAPS TO EFFECT CHAIN</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {analysisResult.chainMap.map((chain, i) => (
                    <span key={i} style={{
                      padding: "4px 10px", borderRadius: 4, fontSize: 11,
                      background: `${COLORS.gold}15`, color: COLORS.gold,
                      border: `1px solid ${COLORS.gold}30`, fontWeight: 600,
                    }}>{chain}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("thesis");

  return (
    <div style={{
      background: COLORS.bg,
      color: COLORS.text,
      minHeight: "100vh",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      fontSize: 14,
    }}>
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 120px)" }}>
        {activeTab === "thesis" && <ThesisTab />}
        {activeTab === "nodes" && <NodesTab />}
        {activeTab === "patterns" && <PatternsTab />}
        {activeTab === "portfolio" && <PortfolioTab />}
        {activeTab === "playbook" && <PlaybookTab />}
        {activeTab === "monitor" && <SignalMonitorTab />}
        {activeTab === "feed" && <LiveFeedTab />}
      </div>
    </div>
  );
}
