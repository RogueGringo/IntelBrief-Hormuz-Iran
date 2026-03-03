import { useState, useEffect, useCallback, useRef } from "react";

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

// ─── KEYWORD DICTIONARIES ────────────────────────────────────
const EFFECT_KEYWORDS = [
  "transit", "ais", "insurance", "p&i", "coverage", "vlcc", "freight",
  "force majeure", "spr", "drawdown", "rig count", "duc", "backwardation",
  "pipeline", "bpd", "production", "inventory", "withdrawn", "suspended",
  "collapsed", "stranded", "utilization", "capacity", "barrels", "tanker",
  "vessel", "rates", "premium", "reinsurance", "spread", "curve", "netback",
  "breakeven", "dolomite", "overpressured", "wellbore", "measured", "binary",
  "tonnage", "loading", "discharge", "draft", "berth", "terminal",
  "shut-in", "flaring", "refinery", "throughput", "storage", "drawdown",
  "exports", "imports", "shipments", "cargo", "demurrage", "charter",
];

const EVENT_KEYWORDS = [
  "announced", "predicted", "analysts say", "expected", "could", "might",
  "sources say", "reportedly", "sentiment", "fears", "hopes", "rally",
  "tumble", "surge", "plunge", "breaking", "rumor", "speculation",
  "believes", "opinion", "according to", "may", "possibly", "likely",
  "forecast", "projected", "risk of", "warns", "caution", "concerned",
  "worried", "optimistic", "pessimistic", "bullish", "bearish", "mood",
];

// ─── CHAIN MAPPING ───────────────────────────────────────────
const CHAIN_TERMS = {
  "Maritime Insurance Cascade": ["insurance", "p&i", "coverage", "withdrawn", "reinsurance", "premium", "hull", "war risk", "club"],
  "Physical Flow Cascade": ["transit", "ais", "tanker", "vessel", "stranded", "vlcc", "freight", "pipeline", "tonnage", "loading", "cargo", "draft"],
  "Price Architecture Cascade": ["brent", "wti", "spread", "backwardation", "curve", "netback", "breakeven", "ovx", "futures", "contango"],
  "Supply Constraint Cascade": ["rig count", "duc", "production", "bpd", "capacity", "frac", "drilling", "completions", "shut-in"],
};

function classifyText(text) {
  const lower = text.toLowerCase();
  const effectHits = EFFECT_KEYWORDS.filter(k => lower.includes(k));
  const eventHits = EVENT_KEYWORDS.filter(k => lower.includes(k));
  const totalHits = effectHits.length + eventHits.length;
  const score = totalHits > 0 ? (effectHits.length - eventHits.length) / totalHits : 0;

  const chainMap = [];
  for (const [chain, terms] of Object.entries(CHAIN_TERMS)) {
    if (terms.some(t => lower.includes(t))) chainMap.push(chain);
  }

  return {
    classification: score > 0.15 ? "EFFECT" : score < -0.15 ? "EVENT" : "MIXED",
    score,
    effectHits,
    eventHits,
    chainMap,
    confidence: totalHits > 0 ? Math.min(100, Math.round((totalHits / 4) * 100)) : 0,
  };
}

// ─── RSS FEED SOURCES ────────────────────────────────────────
const FEED_SOURCES = [
  {
    id: "eia",
    name: "EIA — This Week in Petroleum",
    url: "https://www.eia.gov/petroleum/weekly/includes/twip_rss.xml",
    category: "supply",
    color: COLORS.purple,
  },
  {
    id: "maritime-exec",
    name: "The Maritime Executive",
    url: "https://maritime-executive.com/rss",
    category: "maritime",
    color: COLORS.orange,
  },
  {
    id: "gcaptain",
    name: "gCaptain — Maritime News",
    url: "https://gcaptain.com/feed/",
    category: "maritime",
    color: COLORS.orange,
  },
  {
    id: "oilprice",
    name: "OilPrice.com",
    url: "https://oilprice.com/rss/main",
    category: "price",
    color: COLORS.blue,
  },
  {
    id: "reuters-energy",
    name: "Reuters — Energy",
    url: "https://news.google.com/rss/search?q=oil+energy+hormuz&hl=en-US&gl=US&ceid=US:en",
    category: "macro",
    color: COLORS.gold,
  },
];

// CORS proxy for RSS feeds (client-side only)
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

function parseRSS(xmlText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");
    const items = doc.querySelectorAll("item");
    return Array.from(items).map(item => {
      const title = item.querySelector("title")?.textContent || "";
      const description = item.querySelector("description")?.textContent || "";
      const link = item.querySelector("link")?.textContent || "";
      const pubDate = item.querySelector("pubDate")?.textContent || "";
      // Strip HTML tags from description
      const cleanDesc = description.replace(/<[^>]*>/g, "").trim();
      return { title, description: cleanDesc, link, pubDate };
    });
  } catch {
    return [];
  }
}

// ─── SIMULATED FEED DATA (fallback when CORS blocks) ────────
const SIMULATED_FEED = [
  {
    source: "The Maritime Executive",
    sourceId: "maritime-exec",
    category: "maritime",
    title: "Lloyd's War Risk Committee Suspends Persian Gulf Coverage Pending Review",
    description: "London market syndicates have collectively suspended war risk underwriting for vessels transiting the Strait of Hormuz following the March 1 closure. Approximately 90% of global tanker fleet coverage has been withdrawn. P&I clubs report no new policies being written for Gulf-bound cargo.",
    pubDate: "2026-03-03T14:22:00Z",
    link: "#",
  },
  {
    source: "gCaptain",
    sourceId: "gcaptain",
    category: "maritime",
    title: "AIS Data: Zero Tanker Transits Through Hormuz for Third Consecutive Day",
    description: "Satellite AIS tracking confirms 0 tanker transits through the Strait of Hormuz for the third consecutive day, down from a January average of 138 per day. 152+ vessels remain stranded in the Persian Gulf with no clear timeline for resumed transit. VLCC spot rates have surged to $423,736/day.",
    pubDate: "2026-03-03T12:15:00Z",
    link: "#",
  },
  {
    source: "EIA — This Week in Petroleum",
    sourceId: "eia",
    category: "supply",
    title: "Weekly Petroleum Status Report: Crude Stocks Draw 4.2M Barrels as Imports Decline",
    description: "US commercial crude inventories decreased by 4.2 million barrels. Crude oil imports averaged 5.8 million bpd, down 900K from prior week. Refineries operated at 87.1% capacity. SPR remains at 411 million barrels — no drawdown announced. Baker Hughes rig count steady at 409 oil rigs.",
    pubDate: "2026-03-03T10:30:00Z",
    link: "#",
  },
  {
    source: "OilPrice.com",
    sourceId: "oilprice",
    category: "price",
    title: "Brent Crude Surges Past $84 as Forward Curve Steepens Into Record Backwardation",
    description: "Brent front-month settled at $84.20/bbl, up 17% from pre-crisis levels. WTI Cushing at $76.35 with Brent-WTI spread widening to $7.85. Forward curve shows steep backwardation — prompt $76 declining to $65 by Dec 2026 — indicating market prices temporary disruption. OVX oil volatility index hit 65.4, 96th percentile.",
    pubDate: "2026-03-03T09:45:00Z",
    link: "#",
  },
  {
    source: "Reuters — Energy",
    sourceId: "reuters-energy",
    category: "macro",
    title: "QatarEnergy Declares Force Majeure on All LNG Contracts Through Hormuz",
    description: "QatarEnergy has officially declared force majeure on all LNG supply contracts requiring transit through the Strait of Hormuz, affecting approximately 20% of global LNG supply. European and Asian spot LNG prices have decoupled from contract indices. Japan and South Korea activated strategic reserves.",
    pubDate: "2026-03-03T08:00:00Z",
    link: "#",
  },
  {
    source: "The Maritime Executive",
    sourceId: "maritime-exec",
    category: "maritime",
    title: "Bypass Pipeline Utilization Reaches 51% — East-West Petroline Ramps Up",
    description: "Saudi Aramco has increased throughput on the East-West Petroline to 3.2M bpd of its 5M bpd capacity. ADCOP pipeline running at approximately 1.0M of 1.5M bpd capacity. Combined bypass capacity of 6.5M bpd remains insufficient to replace 15M+ bpd of Hormuz transit volume. 8.5M bpd gap persists.",
    pubDate: "2026-03-02T22:30:00Z",
    link: "#",
  },
  {
    source: "gCaptain",
    sourceId: "gcaptain",
    category: "maritime",
    title: "Cape of Good Hope Re-routing Adds $3-5M Per VLCC Voyage — Shipowners Weigh Options",
    description: "Tanker operators are evaluating Cape of Good Hope routing as the only viable alternative to Hormuz transit. The diversion adds 10-14 sailing days and an estimated $3-5M per VLCC voyage in additional fuel and charter costs. However, without war risk insurance restoration, even alternative routing cannot resume Gulf loading.",
    pubDate: "2026-03-02T18:45:00Z",
    link: "#",
  },
  {
    source: "Reuters — Energy",
    sourceId: "reuters-energy",
    category: "macro",
    title: "Analysts Predict Oil Could Reach $100-$200 if Hormuz Remains Closed Beyond Two Weeks",
    description: "Goldman Sachs raised its Brent forecast to $95/bbl in a base case scenario, with $120-$200/bbl possible if closure extends beyond 30 days. Morgan Stanley analysts warn of 'unprecedented supply disruption.' Market sentiment remains fearful as OPEC+ emergency meeting announced for March 5.",
    pubDate: "2026-03-02T16:00:00Z",
    link: "#",
  },
  {
    source: "EIA — This Week in Petroleum",
    sourceId: "eia",
    category: "supply",
    title: "DUC Inventory Falls to 878 — Near Operational Minimum in Key Basins",
    description: "Drilled-but-uncompleted well inventory in the Permian Basin has fallen to approximately 878, halved from 2024 levels. Industry has been completing DUCs faster than drilling new wells for 18 consecutive months. At current completion rates, DUC buffer will be exhausted within 4-6 months regardless of oil price.",
    pubDate: "2026-03-02T10:00:00Z",
    link: "#",
  },
  {
    source: "OilPrice.com",
    sourceId: "oilprice",
    category: "price",
    title: "Kansas Common Posted Price Jumps to $63.10 — Highest Since Q4 2023",
    description: "Kansas Common posted crude price rose to $63.10/bbl reflecting WTI pass-through minus $13-14 transportation differential. Conventional Kansas well breakevens ($25-45/bbl) now show strong positive margin. HF Sinclair's El Dorado refinery (135K bbl/d) reported full utilization rates.",
    pubDate: "2026-03-01T14:00:00Z",
    link: "#",
  },
  {
    source: "Reuters — Energy",
    sourceId: "reuters-energy",
    category: "macro",
    title: "OPEC+ Announces 206K bpd Production Increase — Market Dismisses as 'Noise'",
    description: "OPEC+ agreed to increase production by 206,000 bpd starting April, representing approximately 0.2% of global demand. Markets largely dismissed the move as immaterial relative to the 15M+ bpd Hormuz disruption. Brent prices were unchanged on the announcement.",
    pubDate: "2026-03-01T08:30:00Z",
    link: "#",
  },
  {
    source: "gCaptain",
    sourceId: "gcaptain",
    category: "maritime",
    title: "Tanker AIS Signals Drop from 47 to 1 in Final Hours Before Complete Closure",
    description: "AIS satellite tracking shows tanker transits through Hormuz fell from 47 on February 28 to just 1 on March 1 before reaching 0 on March 2. The single March 1 transit was reportedly an Iranian-flagged vessel. No commercial tanker movements have been recorded since.",
    pubDate: "2026-03-01T06:00:00Z",
    link: "#",
  },
];

// ─── COMPONENT ───────────────────────────────────────────────
export default function LiveFeedTab() {
  const [feedItems, setFeedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedFilter, setFeedFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const [feedStatus, setFeedStatus] = useState({});
  const [useSimulated, setUseSimulated] = useState(false);

  // Attempt to fetch real RSS feeds, fall back to simulated
  useEffect(() => {
    let cancelled = false;
    async function fetchFeeds() {
      setLoading(true);
      const allItems = [];
      const status = {};

      for (const source of FEED_SOURCES) {
        try {
          const resp = await fetch(CORS_PROXY + encodeURIComponent(source.url), {
            signal: AbortSignal.timeout(8000),
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const text = await resp.text();
          const items = parseRSS(text);
          if (items.length === 0) throw new Error("No items parsed");
          status[source.id] = { ok: true, count: items.length };
          for (const item of items.slice(0, 5)) {
            allItems.push({
              ...item,
              source: source.name,
              sourceId: source.id,
              category: source.category,
              ...classifyText(item.title + " " + item.description),
            });
          }
        } catch (err) {
          status[source.id] = { ok: false, error: err.message };
        }
      }

      if (cancelled) return;

      if (allItems.length < 3) {
        // Not enough real data — use simulated feed
        setUseSimulated(true);
        const simItems = SIMULATED_FEED.map(item => ({
          ...item,
          ...classifyText(item.title + " " + item.description),
        }));
        setFeedItems(simItems);
      } else {
        setFeedItems(allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)));
      }
      setFeedStatus(status);
      setLoading(false);
    }

    fetchFeeds();
    return () => { cancelled = true; };
  }, []);

  // Aggregate statistics
  const effectCount = feedItems.filter(i => i.classification === "EFFECT").length;
  const eventCount = feedItems.filter(i => i.classification === "EVENT").length;
  const mixedCount = feedItems.filter(i => i.classification === "MIXED").length;
  const signalRatio = feedItems.length > 0 ? Math.round((effectCount / feedItems.length) * 100) : 0;

  // Filtered items
  const filtered = feedItems.filter(item => {
    if (feedFilter !== "all" && item.category !== feedFilter) return false;
    if (classFilter !== "all" && item.classification !== classFilter) return false;
    return true;
  });

  const categoryColors = {
    maritime: COLORS.orange,
    supply: COLORS.purple,
    price: COLORS.blue,
    macro: COLORS.gold,
  };

  const classColors = {
    EFFECT: COLORS.green,
    EVENT: COLORS.red,
    MIXED: COLORS.orange,
  };

  return (
    <div style={{ padding: "32px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22, color: COLORS.gold, margin: "0 0 6px" }}>
            Live Intelligence Feed
          </h2>
          <p style={{ fontSize: 13, color: COLORS.textDim, margin: 0, lineHeight: 1.5, maxWidth: 700 }}>
            Aggregated open-source data classified in real-time as{" "}
            <strong style={{ color: COLORS.green }}>effects</strong> (measurable physical changes) or{" "}
            <strong style={{ color: COLORS.red }}>events</strong> (narrative, prediction, sentiment).
            {useSimulated && (
              <span style={{ color: COLORS.textMuted }}> Showing scenario data — RSS feeds unavailable.</span>
            )}
          </p>
        </div>
        <div style={{
          padding: "10px 16px", borderRadius: 8,
          background: `${signalRatio >= 50 ? COLORS.green : COLORS.red}15`,
          border: `1px solid ${signalRatio >= 50 ? COLORS.green : COLORS.red}40`,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: signalRatio >= 50 ? COLORS.green : COLORS.red }}>
            {signalRatio}%
          </div>
          <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1 }}>SIGNAL RATIO</div>
        </div>
      </div>

      {/* Aggregate bar */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20,
      }}>
        {[
          { label: "TOTAL ITEMS", value: feedItems.length, color: COLORS.gold },
          { label: "EFFECTS (SIGNAL)", value: effectCount, color: COLORS.green },
          { label: "EVENTS (NOISE)", value: eventCount, color: COLORS.red },
          { label: "MIXED / AMBIGUOUS", value: mixedCount, color: COLORS.orange },
        ].map((stat, i) => (
          <div key={i} style={{
            padding: "14px 16px", borderRadius: 8, textAlign: "center",
            background: `${stat.color}08`, border: `1px solid ${stat.color}20`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1, marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        display: "flex", gap: 24, marginBottom: 20, padding: "14px 20px",
        background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10,
      }}>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 6 }}>SOURCE TYPE</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["all", "maritime", "supply", "price", "macro"].map(cat => (
              <button key={cat} onClick={() => setFeedFilter(cat)} style={{
                padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                cursor: "pointer", border: "1px solid", textTransform: "uppercase", letterSpacing: 0.5,
                background: feedFilter === cat ? (cat === "all" ? COLORS.gold + "20" : (categoryColors[cat] || COLORS.gold) + "25") : "transparent",
                borderColor: feedFilter === cat ? (cat === "all" ? COLORS.gold : categoryColors[cat] || COLORS.gold) : COLORS.border,
                color: feedFilter === cat ? (cat === "all" ? COLORS.gold : categoryColors[cat] || COLORS.gold) : COLORS.textMuted,
              }}>
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 6 }}>CLASSIFICATION</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["all", "EFFECT", "EVENT", "MIXED"].map(cls => (
              <button key={cls} onClick={() => setClassFilter(cls)} style={{
                padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                cursor: "pointer", border: "1px solid", letterSpacing: 0.5,
                background: classFilter === cls ? (cls === "all" ? COLORS.gold + "20" : (classColors[cls] || COLORS.gold) + "25") : "transparent",
                borderColor: classFilter === cls ? (cls === "all" ? COLORS.gold : classColors[cls] || COLORS.gold) : COLORS.border,
                color: classFilter === cls ? (cls === "all" ? COLORS.gold : classColors[cls] || COLORS.gold) : COLORS.textMuted,
              }}>
                {cls === "all" ? "ALL" : cls}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: COLORS.textDim }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Fetching intelligence feeds...</div>
          <div style={{ width: 200, height: 4, borderRadius: 2, background: COLORS.border, margin: "0 auto", overflow: "hidden" }}>
            <div style={{ width: "60%", height: "100%", background: COLORS.gold, borderRadius: 2, animation: "pulse 1.5s infinite" }} />
          </div>
        </div>
      )}

      {/* Feed items */}
      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((item, i) => {
            const isSelected = selectedItem === i;
            const classColor = classColors[item.classification] || COLORS.textMuted;
            const catColor = categoryColors[item.category] || COLORS.gold;
            return (
              <div
                key={i}
                onClick={() => setSelectedItem(isSelected ? null : i)}
                style={{
                  background: isSelected ? `${classColor}08` : COLORS.surface,
                  border: `1px solid ${isSelected ? classColor + "40" : COLORS.border}`,
                  borderLeft: `3px solid ${classColor}`,
                  borderRadius: 10,
                  padding: "16px 20px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: 1,
                      padding: "2px 8px", borderRadius: 3,
                      background: `${classColor}20`, color: classColor,
                    }}>
                      {item.classification}
                    </span>
                    <span style={{
                      fontSize: 9, letterSpacing: 0.5,
                      padding: "2px 8px", borderRadius: 3,
                      background: `${catColor}15`, color: catColor,
                    }}>
                      {item.source}
                    </span>
                    {item.confidence > 70 && (
                      <span style={{ fontSize: 9, color: COLORS.textMuted }}>
                        {item.confidence}% confidence
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                    {item.pubDate ? new Date(item.pubDate).toLocaleString("en-US", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    }) : ""}
                  </span>
                </div>

                {/* Title */}
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, lineHeight: 1.4, marginBottom: 6 }}>
                  {item.title}
                </div>

                {/* Description (truncated unless selected) */}
                <div style={{
                  fontSize: 12, color: COLORS.textDim, lineHeight: 1.6,
                  overflow: isSelected ? "visible" : "hidden",
                  maxHeight: isSelected ? "none" : 40,
                }}>
                  {item.description}
                </div>

                {/* Expanded details */}
                {isSelected && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
                    <div style={{ display: "flex", gap: 16 }}>
                      {/* Effect terms */}
                      {item.effectHits && item.effectHits.length > 0 && (
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: COLORS.green, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                            EFFECT TERMS DETECTED
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {item.effectHits.map((k, j) => (
                              <span key={j} style={{
                                padding: "2px 6px", borderRadius: 3, fontSize: 10,
                                background: `${COLORS.green}15`, color: COLORS.green,
                                border: `1px solid ${COLORS.green}25`,
                              }}>{k}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Event terms */}
                      {item.eventHits && item.eventHits.length > 0 && (
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: COLORS.red, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                            EVENT TERMS DETECTED
                          </div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {item.eventHits.map((k, j) => (
                              <span key={j} style={{
                                padding: "2px 6px", borderRadius: 3, fontSize: 10,
                                background: `${COLORS.red}15`, color: COLORS.red,
                                border: `1px solid ${COLORS.red}25`,
                              }}>{k}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Chain mapping */}
                    {item.chainMap && item.chainMap.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 9, color: COLORS.gold, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                          MAPS TO EFFECT CHAIN
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {item.chainMap.map((chain, j) => (
                            <span key={j} style={{
                              padding: "3px 8px", borderRadius: 4, fontSize: 10,
                              background: `${COLORS.gold}12`, color: COLORS.gold,
                              border: `1px solid ${COLORS.gold}25`, fontWeight: 600,
                            }}>{chain}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Feed source status (footer) */}
      {!loading && (
        <div style={{
          marginTop: 20, padding: "14px 20px", borderRadius: 10,
          background: COLORS.surface, border: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1, marginBottom: 8 }}>
            DATA SOURCES {useSimulated && "— SCENARIO MODE (RSS UNAVAILABLE)"}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {FEED_SOURCES.map(src => {
              const st = feedStatus[src.id];
              return (
                <div key={src.id} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "4px 10px", borderRadius: 4,
                  background: `${src.color}08`, border: `1px solid ${src.color}15`,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: st?.ok ? COLORS.green : useSimulated ? COLORS.orange : COLORS.red,
                  }} />
                  <span style={{ fontSize: 10, color: COLORS.textDim }}>{src.name}</span>
                  {st?.ok && <span style={{ fontSize: 9, color: COLORS.textMuted }}>({st.count})</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
