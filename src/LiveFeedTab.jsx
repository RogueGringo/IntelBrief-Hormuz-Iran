import { useState, useEffect, useCallback, useRef } from "react";
import { fetchAllFeeds, FEED_SOURCES } from "./DataService.jsx";
import { COLORS } from "./theme.js";

const VERIFY_SOURCES = [
  { label: "Google News — Hormuz", url: "https://news.google.com/search?q=strait%20of%20hormuz%20oil%20tanker" },
  { label: "EIA — This Week in Petroleum", url: "https://www.eia.gov/petroleum/weekly/" },
  { label: "gCaptain — Maritime News", url: "https://gcaptain.com/" },
  { label: "The Maritime Executive", url: "https://maritime-executive.com/" },
  { label: "OilPrice.com", url: "https://oilprice.com/" },
];

const REFRESH_INTERVAL = 3 * 60 * 1000; // 3 minutes

export default function LiveFeedTab() {
  const [feedData, setFeedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedFilter, setFeedFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [selectedItemKey, setSelectedItemKey] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [nextRefresh, setNextRefresh] = useState(null);
  const [refreshCountdown, setRefreshCountdown] = useState(null);
  const refreshTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const hasFetchedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const doRefresh = useCallback(async () => {
    // Only show full loading state on first fetch — use ref to avoid stale closure
    if (!hasFetchedRef.current) setLoading(true);
    try {
      const data = await fetchAllFeeds();
      if (!mountedRef.current) return;
      setFeedData(data);
      hasFetchedRef.current = true;
      setLastRefresh(new Date());
      setNextRefresh(new Date(Date.now() + REFRESH_INTERVAL));
    } catch {
      // keep existing data
    }
    if (mountedRef.current) setLoading(false);
  }, []); // no dependencies — uses refs for mutable state

  // Initial fetch + auto-refresh
  useEffect(() => {
    doRefresh();
    refreshTimerRef.current = setInterval(doRefresh, REFRESH_INTERVAL);
    return () => clearInterval(refreshTimerRef.current);
  }, [doRefresh]);

  // Countdown timer
  useEffect(() => {
    if (!nextRefresh) return;
    countdownRef.current = setInterval(() => {
      const diff = Math.max(0, Math.ceil((nextRefresh - Date.now()) / 1000));
      setRefreshCountdown(diff);
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [nextRefresh]);

  const feedItems = feedData?.items || [];
  const sourceStatus = feedData?.sourceStatus || {};
  const dataSource = feedData?.source || "loading";
  const liveCount = feedData?.liveCount || 0;

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

  const formatCountdown = (s) => {
    if (s === null) return "";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
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
            Real-time open-source intelligence classified as{" "}
            <strong style={{ color: COLORS.green }}>effects</strong> (measurable physical changes) or{" "}
            <strong style={{ color: COLORS.red }}>events</strong> (narrative, prediction, sentiment).
            Auto-refreshes every 3 minutes from {FEED_SOURCES.length} sources.
          </p>
        </div>

        {/* Data freshness + signal ratio */}
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{
            padding: "10px 14px", borderRadius: 8,
            background: `${dataSource === "live" ? COLORS.green : dataSource === "cached" ? COLORS.blue : COLORS.orange}10`,
            border: `1px solid ${dataSource === "live" ? COLORS.green : dataSource === "cached" ? COLORS.blue : COLORS.orange}30`,
            textAlign: "center", minWidth: 90,
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginBottom: 4,
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: dataSource === "live" ? COLORS.green : dataSource === "cached" ? COLORS.blue : COLORS.orange,
                animation: dataSource === "live" ? "pulse 2s infinite" : "none",
              }} />
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: 1,
                color: dataSource === "live" ? COLORS.green : dataSource === "cached" ? COLORS.blue : COLORS.orange,
              }}>
                {dataSource === "live" ? "LIVE" : dataSource === "cached" ? "CACHED" : "LOADING"}
              </span>
            </div>
            <div style={{ fontSize: 9, color: COLORS.textMuted }}>
              {liveCount}/{FEED_SOURCES.length} sources
            </div>
            {refreshCountdown !== null && (
              <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 2 }}>
                refresh {formatCountdown(refreshCountdown)}
              </div>
            )}
          </div>
          <div style={{
            padding: "10px 14px", borderRadius: 8,
            background: `${signalRatio >= 50 ? COLORS.green : COLORS.red}10`,
            border: `1px solid ${signalRatio >= 50 ? COLORS.green : COLORS.red}30`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: signalRatio >= 50 ? COLORS.green : COLORS.red }}>
              {signalRatio}%
            </div>
            <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1 }}>SIGNAL RATIO</div>
          </div>
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
        alignItems: "center",
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
        <button
          onClick={doRefresh}
          style={{
            marginLeft: "auto", padding: "8px 16px", borderRadius: 6, fontSize: 10,
            fontWeight: 700, letterSpacing: 1, cursor: "pointer",
            background: `${COLORS.gold}15`, border: `1px solid ${COLORS.gold}40`,
            color: COLORS.gold,
          }}
        >
          REFRESH NOW
        </button>
      </div>

      {/* Loading state */}
      {loading && feedItems.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: COLORS.textDim }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Fetching live intelligence feeds...</div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 12 }}>
            Querying {FEED_SOURCES.length} open-source feeds via CORS proxies
          </div>
          <div style={{ width: 200, height: 4, borderRadius: 2, background: COLORS.border, margin: "0 auto", overflow: "hidden" }}>
            <div style={{ width: "60%", height: "100%", background: COLORS.gold, borderRadius: 2, animation: "pulse 1.5s infinite" }} />
          </div>
        </div>
      )}

      {/* Feed items */}
      {feedItems.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((item) => {
            const itemKey = (item.title + item.link).slice(0, 120);
            const isSelected = selectedItemKey === itemKey;
            const classColor = classColors[item.classification] || COLORS.textMuted;
            const catColor = categoryColors[item.category] || COLORS.gold;
            return (
              <div
                key={itemKey}
                onClick={() => setSelectedItemKey(isSelected ? null : itemKey)}
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

                {/* Description */}
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
                    {item.link && item.link !== "#" && (
                      <div style={{ marginTop: 8 }}>
                        <a href={item.link} target="_blank" rel="noopener noreferrer" style={{
                          fontSize: 10, color: COLORS.blue, textDecoration: "none",
                        }}>
                          Open source article →
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* No results */}
      {!loading && feedItems.length === 0 && (
        <div style={{
          textAlign: "center", padding: 40,
          background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 14, color: COLORS.textDim, marginBottom: 8 }}>
            No live feeds available — RSS sources blocked by CORS
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6 }}>
            This dashboard runs entirely client-side. Some RSS feeds block cross-origin requests.
            Try refreshing, or check back — feeds are retried every 3 minutes via multiple CORS proxies.
          </div>
        </div>
      )}

      {/* Feed source status */}
      <div style={{
        marginTop: 20, padding: "14px 20px", borderRadius: 10,
        background: COLORS.surface, border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1 }}>
            DATA SOURCES — {liveCount}/{FEED_SOURCES.length} ACTIVE
          </div>
          {lastRefresh && (
            <div style={{ fontSize: 9, color: COLORS.textMuted }}>
              Last fetched: {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {FEED_SOURCES.map(src => {
            const st = sourceStatus[src.id];
            const color = categoryColors[src.category] || COLORS.gold;
            return (
              <div key={src.id} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 4,
                background: `${color}08`, border: `1px solid ${color}15`,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: st?.ok ? COLORS.green : COLORS.red,
                }} />
                <span style={{ fontSize: 10, color: COLORS.textDim }}>{src.name}</span>
                {st?.ok && <span style={{ fontSize: 9, color: COLORS.textMuted }}>({st.count})</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: COLORS.textMuted, marginBottom: 10 }}>
          VERIFY UPSTREAM SOURCES
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {VERIFY_SOURCES.map((src, i) => (
            <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 5, fontSize: 11,
              background: `${COLORS.blue}10`, border: `1px solid ${COLORS.blue}20`,
              color: COLORS.blue, textDecoration: "none", letterSpacing: 0.3,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.green, flexShrink: 0 }} />
              {src.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
