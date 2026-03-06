import { useState, useEffect, useMemo } from "react";
import { fetchTrends } from "./DataService.jsx";
import { COLORS, CLASS_COLORS } from "./theme.js";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, ReferenceLine, Area, AreaChart,
  ScatterChart, Scatter, ZAxis, Cell,
} from "recharts";

const CARD = {
  background: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};

const METRIC_DEFS = [
  { key: "confidence", label: "Classification Confidence", color: COLORS.gold, fmt: v => (v * 100).toFixed(0) + "%" },
  { key: "quality_score", label: "Data Quality", color: COLORS.green, fmt: v => v?.toFixed(2) },
  { key: "peak_accel", label: "Peak Accel (g)", color: COLORS.blue, fmt: v => v?.toFixed(1) },
  { key: "total_persistence", label: "Total Persistence", color: COLORS.purple, fmt: v => v?.toFixed(2) },
  { key: "n_phases", label: "Phases Detected", color: "#e0c040", fmt: v => v },
  { key: "betti_0", label: "Betti-0", color: COLORS.blue, fmt: v => v },
  { key: "betti_1", label: "Betti-1", color: COLORS.purple, fmt: v => v },
];

function movingAvg(arr, key, window = 3) {
  return arr.map((pt, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1).filter(p => p[key] != null);
    if (!slice.length) return { ...pt, [`${key}_ma`]: null };
    const avg = slice.reduce((s, p) => s + p[key], 0) / slice.length;
    return { ...pt, [`${key}_ma`]: avg };
  });
}

export default function ProgressTab() {
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMetrics, setSelectedMetrics] = useState(["confidence", "quality_score"]);
  const [compareIds, setCompareIds] = useState([]);

  useEffect(() => {
    fetchTrends().then(data => {
      setTrends(data);
      setLoading(false);
    });
  }, []);

  const sessions = trends?.sessions || [];

  const chartData = useMemo(() => {
    if (!sessions.length) return [];
    let data = sessions.map((s, i) => ({
      idx: i + 1,
      label: s.filename?.replace(/\.csv$/i, "").slice(0, 20) || s.id.slice(0, 8),
      ...s,
    }));
    // Add moving averages for selected metrics
    for (const key of selectedMetrics) {
      data = movingAvg(data, key, 3);
    }
    return data;
  }, [sessions, selectedMetrics]);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (!sessions.length) return null;
    const latest = sessions[sessions.length - 1];
    const first = sessions[0];
    const avgConf = sessions.reduce((s, x) => s + (x.confidence || 0), 0) / sessions.length;
    const avgQuality = sessions.filter(x => x.quality_score != null);
    const avgQ = avgQuality.length ? avgQuality.reduce((s, x) => s + x.quality_score, 0) / avgQuality.length : null;

    const confDelta = sessions.length > 1 ? (latest.confidence || 0) - (first.confidence || 0) : 0;
    return {
      totalSessions: sessions.length,
      avgConfidence: avgConf,
      avgQuality: avgQ,
      confidenceTrend: confDelta,
      latestClassification: latest.classification,
      latestConfidence: latest.confidence,
    };
  }, [sessions]);

  // Classification distribution
  const classDistribution = useMemo(() => {
    const counts = {};
    sessions.forEach(s => {
      const c = s.classification || "unclassified";
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count, pct: (count / sessions.length * 100).toFixed(0) }));
  }, [sessions]);

  const toggleMetric = (key) => {
    setSelectedMetrics(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: COLORS.textDim }}>
        Loading trend data...
      </div>
    );
  }

  if (!sessions.length) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: COLORS.textDim }}>
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>&#x1F4C8;</div>
        <div style={{ fontSize: 14 }}>No analyzed sessions yet. Upload and analyze motion data in SESSION FEED to see progress trends.</div>
      </div>
    );
  }

  const trendArrow = (delta) => delta > 0.01 ? "▲" : delta < -0.01 ? "▼" : "—";
  const trendColor = (delta) => delta > 0.01 ? COLORS.green : delta < -0.01 ? COLORS.red : COLORS.textDim;

  const exportReport = () => {
    const w = window.open("", "_blank");
    const rows = chartData.map(s => `
      <tr>
        <td>${s.label}</td>
        <td style="text-transform:uppercase">${s.classification || "—"}</td>
        <td>${((s.confidence || 0) * 100).toFixed(0)}%</td>
        <td>${s.quality_score?.toFixed(3) ?? "—"}</td>
        <td>${s.peak_accel?.toFixed(1) ?? "—"}</td>
        <td>${s.n_phases ?? "—"}</td>
        <td>${s.betti_0 ?? "—"} / ${s.betti_1 ?? "—"}</td>
        <td>${s.total_persistence?.toFixed(3) ?? "—"}</td>
      </tr>`).join("");
    const classDist = classDistribution.map(c => `${c.name}: ${c.count} (${c.pct}%)`).join(", ");
    w.document.write(`<!DOCTYPE html><html><head><title>Motion Intelligence Report</title>
      <style>
        body{font-family:system-ui,sans-serif;background:#0a0c10;color:#e8e4dc;padding:40px;max-width:900px;margin:0 auto}
        h1{color:#d4a843;font-size:22px;border-bottom:2px solid #d4a843;padding-bottom:8px}
        h2{color:#d4a843;font-size:16px;margin-top:30px}
        .stat{display:inline-block;background:#12151c;border:1px solid #1e2330;border-radius:6px;padding:12px 20px;margin:4px;text-align:center}
        .stat .n{font-size:28px;font-weight:700;color:#d4a843}
        .stat .l{font-size:9px;color:#8a8678;letter-spacing:1px}
        table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}
        th{text-align:left;padding:6px 8px;border-bottom:1px solid #1e2330;color:#8a8678;font-weight:600}
        td{padding:5px 8px;border-bottom:1px solid #1e233022}
        .footer{margin-top:40px;font-size:10px;color:#8a8678;border-top:1px solid #1e2330;padding-top:12px}
        @media print{body{background:#fff;color:#222}th{color:#666;border-color:#ccc}td{border-color:#eee}.stat{border-color:#ccc}.stat .n{color:#333}h1,h2{color:#333;border-color:#333}}
      </style></head><body>
      <h1>Motion Intelligence Report</h1>
      <p style="color:#8a8678;font-size:12px">${sessions.length} sessions analyzed &middot; Generated ${new Date().toLocaleString()}</p>
      <div style="margin:20px 0">
        <div class="stat"><div class="l">SESSIONS</div><div class="n">${summaryStats.totalSessions}</div></div>
        <div class="stat"><div class="l">AVG CONFIDENCE</div><div class="n">${(summaryStats.avgConfidence * 100).toFixed(0)}%</div></div>
        <div class="stat"><div class="l">AVG QUALITY</div><div class="n">${summaryStats.avgQuality?.toFixed(2) ?? "N/A"}</div></div>
        <div class="stat"><div class="l">LATEST</div><div class="n" style="font-size:14px;text-transform:uppercase">${summaryStats.latestClassification || "—"}</div></div>
      </div>
      <h2>Classification Distribution</h2>
      <p style="font-size:12px">${classDist}</p>
      <h2>Session Detail</h2>
      <table>
        <thead><tr><th>Session</th><th>Class</th><th>Conf</th><th>Quality</th><th>Peak G</th><th>Phases</th><th>B0/B1</th><th>Persist</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">Sovereign Motion Intelligence &middot; Powered by sovereign-lib topological analysis</div>
      </body></html>`);
    w.document.close();
    w.print();
  };

  return (
    <div style={{ padding: 20, color: COLORS.text }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ color: COLORS.gold, fontSize: 20, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
            PROGRESS TRACKING
          </h2>
          <p style={{ color: COLORS.textDim, fontSize: 12, margin: "4px 0 0", letterSpacing: 0.5 }}>
            Multi-Session Trend Analysis &middot; {sessions.length} sessions
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={exportReport}
            style={{ padding: "6px 14px", fontSize: 10, fontWeight: 700, letterSpacing: 1, border: `1px solid ${COLORS.gold}40`, borderRadius: 4, background: `${COLORS.gold}10`, color: COLORS.gold, cursor: "pointer" }}
          >
            EXPORT REPORT
          </button>
          <button
            onClick={() => { fetch("/api/export/csv").then(r => r.text()).then(csv => { const blob = new Blob([csv], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `motion_export_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); }); }}
            style={{ padding: "6px 14px", fontSize: 10, fontWeight: 700, letterSpacing: 1, border: `1px solid ${COLORS.border}`, borderRadius: 4, background: "transparent", color: COLORS.textDim, cursor: "pointer" }}
          >
            CSV EXPORT
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summaryStats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          <div style={CARD}>
            <div style={{ fontSize: 10, color: COLORS.textDim, letterSpacing: 1, marginBottom: 4 }}>SESSIONS</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.gold }}>{summaryStats.totalSessions}</div>
          </div>
          <div style={CARD}>
            <div style={{ fontSize: 10, color: COLORS.textDim, letterSpacing: 1, marginBottom: 4 }}>AVG CONFIDENCE</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>
              {(summaryStats.avgConfidence * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: 11, color: trendColor(summaryStats.confidenceTrend), marginTop: 2 }}>
              {trendArrow(summaryStats.confidenceTrend)} {(summaryStats.confidenceTrend * 100).toFixed(1)}pp vs first
            </div>
          </div>
          <div style={CARD}>
            <div style={{ fontSize: 10, color: COLORS.textDim, letterSpacing: 1, marginBottom: 4 }}>AVG QUALITY</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text }}>
              {summaryStats.avgQuality != null ? summaryStats.avgQuality.toFixed(2) : "N/A"}
            </div>
          </div>
          <div style={CARD}>
            <div style={{ fontSize: 10, color: COLORS.textDim, letterSpacing: 1, marginBottom: 4 }}>LATEST CLASS</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.gold, textTransform: "uppercase" }}>
              {summaryStats.latestClassification || "—"}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
              {((summaryStats.latestConfidence || 0) * 100).toFixed(0)}% confidence
            </div>
          </div>
        </div>
      )}

      {/* Metric Selector */}
      <div style={{ ...CARD, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: COLORS.textDim, letterSpacing: 1, marginRight: 8 }}>METRICS:</span>
        {METRIC_DEFS.map(m => (
          <button
            key={m.key}
            onClick={() => toggleMetric(m.key)}
            style={{
              padding: "4px 10px",
              fontSize: 10,
              fontWeight: 600,
              border: `1px solid ${selectedMetrics.includes(m.key) ? m.color : COLORS.border}`,
              borderRadius: 3,
              background: selectedMetrics.includes(m.key) ? `${m.color}20` : "transparent",
              color: selectedMetrics.includes(m.key) ? m.color : COLORS.textDim,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Main Trend Chart */}
      <div style={CARD}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 12, letterSpacing: 0.5 }}>
          SESSION TRENDS
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="idx" tick={{ fill: COLORS.textDim, fontSize: 10 }} label={{ value: "Session #", position: "insideBottom", offset: -2, fill: COLORS.textDim, fontSize: 10 }} />
            <YAxis tick={{ fill: COLORS.textDim, fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 11, color: COLORS.text }}
              labelFormatter={i => chartData[i - 1]?.label || `#${i}`}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {selectedMetrics.map(key => {
              const def = METRIC_DEFS.find(m => m.key === key);
              return [
                <Line key={key} type="monotone" dataKey={key} stroke={def.color} strokeWidth={1.5} dot={{ r: 3, fill: def.color }} name={def.label} connectNulls />,
                <Line key={`${key}_ma`} type="monotone" dataKey={`${key}_ma`} stroke={def.color} strokeWidth={2.5} strokeDasharray="6 3" dot={false} name={`${def.label} (3-MA)`} connectNulls />,
              ];
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Classification Distribution */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={CARD}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 12, letterSpacing: 0.5 }}>
            CLASSIFICATION DISTRIBUTION
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={classDistribution} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="name" tick={{ fill: COLORS.textDim, fontSize: 9 }} />
              <YAxis tick={{ fill: COLORS.textDim, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 11, color: COLORS.text }} />
              <Bar dataKey="count" fill={COLORS.gold} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Confidence Over Time (Area) */}
        <div style={CARD}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 12, letterSpacing: 0.5 }}>
            CONFIDENCE TRAJECTORY
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="idx" tick={{ fill: COLORS.textDim, fontSize: 10 }} />
              <YAxis domain={[0, 1]} tick={{ fill: COLORS.textDim, fontSize: 10 }} tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
              <Tooltip contentStyle={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 11, color: COLORS.text }} formatter={v => `${(v * 100).toFixed(1)}%`} />
              <Area type="monotone" dataKey="confidence" stroke={COLORS.gold} fill={`${COLORS.gold}30`} strokeWidth={2} dot={{ r: 3, fill: COLORS.gold }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Latest vs Average Radar */}
      {sessions.length >= 2 && (() => {
        const metrics = [
          { key: "confidence", label: "Confidence", max: 1 },
          { key: "quality_score", label: "Quality", max: 1 },
          { key: "peak_accel", label: "Peak G", max: Math.max(...sessions.map(s => s.peak_accel || 0)) || 10 },
          { key: "n_phases", label: "Phases", max: 8 },
          { key: "betti_0", label: "Betti-0", max: Math.max(...sessions.map(s => s.betti_0 || 0)) || 5 },
          { key: "total_persistence", label: "Persistence", max: Math.max(...sessions.map(s => s.total_persistence || 0)) || 1 },
        ];
        const latest = sessions[sessions.length - 1];
        const avg = {};
        metrics.forEach(m => {
          const vals = sessions.filter(s => s[m.key] != null).map(s => s[m.key]);
          avg[m.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        });
        const cx = 140, cy = 120, R = 90;
        const n = metrics.length;
        const toXY = (i, val, max) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const r = R * Math.min(val / (max || 1), 1);
          return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
        };
        const avgPts = metrics.map((m, i) => toXY(i, avg[m.key], m.max));
        const latPts = metrics.map((m, i) => toXY(i, latest[m.key] || 0, m.max));
        const toPath = pts => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") + " Z";

        return (
          <div style={{ ...CARD, textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 8, letterSpacing: 0.5, textAlign: "left" }}>
              LATEST vs AVERAGE
            </div>
            <svg width={280} height={260} viewBox="0 0 280 240" style={{ maxWidth: "100%" }}>
              {/* Grid rings */}
              {[0.25, 0.5, 0.75, 1].map(f => (
                <polygon key={f} points={metrics.map((_, i) => toXY(i, f * metrics[i].max, metrics[i].max).join(",")).join(" ")}
                  fill="none" stroke={COLORS.border} strokeWidth={0.5} />
              ))}
              {/* Axis lines */}
              {metrics.map((_, i) => {
                const [x, y] = toXY(i, 1 * metrics[i].max, metrics[i].max);
                return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={COLORS.border} strokeWidth={0.5} />;
              })}
              {/* Average polygon */}
              <path d={toPath(avgPts)} fill={`${COLORS.blue}20`} stroke={COLORS.blue} strokeWidth={1.5} strokeDasharray="4 2" />
              {/* Latest polygon */}
              <path d={toPath(latPts)} fill={`${COLORS.gold}20`} stroke={COLORS.gold} strokeWidth={2} />
              {/* Labels */}
              {metrics.map((m, i) => {
                const [x, y] = toXY(i, 1.18 * m.max, m.max);
                return <text key={m.key} x={x} y={y} fill={COLORS.textDim} fontSize={9} textAnchor="middle" dominantBaseline="middle">{m.label}</text>;
              })}
              {/* Dots */}
              {latPts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill={COLORS.gold} />)}
              {avgPts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.5} fill={COLORS.blue} />)}
            </svg>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", fontSize: 10, marginTop: 4 }}>
              <span style={{ color: COLORS.gold }}>&#9632; Latest Session</span>
              <span style={{ color: COLORS.blue }}>&#9644; Average (all)</span>
            </div>
          </div>
        );
      })()}

      {/* Session Timeline */}
      <div style={CARD}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 12, letterSpacing: 0.5 }}>
          SESSION TIMELINE
        </div>
        <div style={{ position: "relative", padding: "20px 0 30px" }}>
          {/* Timeline axis */}
          <div style={{ position: "absolute", left: 20, right: 20, top: "50%", height: 2, background: COLORS.border, transform: "translateY(-1px)" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 10px", minHeight: 80 }}>
            {chartData.map((s, i) => {
              const cls = (s.classification || "").toUpperCase();
              const dotColor = CLASS_COLORS[cls] || COLORS.textDim;
              const size = 8 + Math.min(16, (s.peak_accel || 0) * 2);
              const conf = s.confidence || 0;
              return (
                <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, position: "relative" }}>
                  {/* Confidence bar above */}
                  <div style={{
                    width: 4, height: Math.round(conf * 40), background: `${dotColor}80`,
                    borderRadius: 2, marginBottom: 4, transition: "height 0.3s",
                  }} />
                  {/* Session dot */}
                  <div
                    title={`${s.label}\n${s.classification || "unclassified"}\nConf: ${(conf * 100).toFixed(0)}%\nPeak: ${s.peak_accel?.toFixed(1) || "?"}g`}
                    style={{
                      width: size, height: size, borderRadius: "50%",
                      background: dotColor, border: `2px solid ${COLORS.surface}`,
                      boxShadow: `0 0 6px ${dotColor}60`,
                      cursor: "default", transition: "all 0.2s", zIndex: 1,
                    }}
                  />
                  {/* Label below */}
                  <div style={{ fontSize: 8, color: COLORS.textDim, marginTop: 6, textAlign: "center", maxWidth: 50, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {i + 1}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 12 }}>
            {Object.entries(CLASS_COLORS).map(([cls, color]) => (
              <div key={cls} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                <span style={{ fontSize: 9, color: COLORS.textDim, letterSpacing: 0.5 }}>{cls}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.textDim }} />
              <span style={{ fontSize: 9, color: COLORS.textDim, letterSpacing: 0.5 }}>UNCLASSIFIED</span>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 9, color: COLORS.textDim, textAlign: "center", marginTop: 4 }}>
          Dot size = peak acceleration &middot; Bar height = confidence
        </div>
      </div>

      {/* Phase Distribution Heatmap */}
      {sessions.some(s => s.n_phases > 0) && (
        <div style={CARD}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 12, letterSpacing: 0.5 }}>
            MOTION PHASE HEATMAP
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 6px", color: COLORS.textDim, fontSize: 9, fontWeight: 600 }}>#</th>
                  {["idle", "onset", "load", "peak_load", "drive", "impact", "follow", "recovery"].map(phase => (
                    <th key={phase} style={{ textAlign: "center", padding: "4px 4px", color: COLORS.textDim, fontSize: 8, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>
                      {phase.replace("_", " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.map((s, i) => {
                  const phases = s.phase_counts || {};
                  const maxCount = Math.max(1, ...Object.values(phases));
                  return (
                    <tr key={s.id}>
                      <td style={{ padding: "3px 6px", color: COLORS.textDim, fontSize: 9 }}>{i + 1}</td>
                      {["idle", "onset", "load", "peak_load", "drive", "impact", "follow", "recovery"].map(phase => {
                        const count = phases[phase] || 0;
                        const intensity = count / maxCount;
                        return (
                          <td key={phase} style={{ padding: 2, textAlign: "center" }}>
                            <div
                              title={`${phase}: ${count}`}
                              style={{
                                width: "100%", height: 18, borderRadius: 2,
                                background: count > 0 ? `rgba(212, 168, 67, ${0.15 + intensity * 0.7})` : `${COLORS.border}40`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 8, color: intensity > 0.5 ? COLORS.bg : COLORS.textDim,
                                fontWeight: intensity > 0.5 ? 700 : 400,
                              }}
                            >
                              {count > 0 ? count : ""}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 9, color: COLORS.textDim, textAlign: "center", marginTop: 8 }}>
            Phase sample counts per session &middot; Darker = more samples in phase
          </div>
        </div>
      )}

      {/* Session Table */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, letterSpacing: 0.5 }}>
            SESSION DETAIL
          </div>
          {compareIds.length > 0 && (
            <button onClick={() => setCompareIds([])} style={{ padding: "3px 10px", fontSize: 9, border: `1px solid ${COLORS.border}`, borderRadius: 3, background: "transparent", color: COLORS.textDim, cursor: "pointer" }}>
              CLEAR COMPARE
            </button>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <th style={{ textAlign: "center", padding: "6px 4px", color: COLORS.textDim, fontWeight: 600, width: 30 }}>CMP</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600, letterSpacing: 0.5 }}>#</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600 }}>SESSION</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600 }}>CLASS</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600 }}>CONF</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600 }}>QUALITY</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600 }}>PEAK G</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600 }}>PHASES</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600 }}>B0</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600 }}>B1</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600 }}>PERSIST</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((s, i) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                  <td style={{ padding: "5px 4px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={compareIds.includes(s.id)}
                      onChange={() => setCompareIds(prev =>
                        prev.includes(s.id) ? prev.filter(x => x !== s.id) : prev.length < 2 ? [...prev, s.id] : [prev[1], s.id]
                      )}
                      style={{ accentColor: COLORS.gold, cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "5px 8px", color: COLORS.textDim }}>{i + 1}</td>
                  <td style={{ padding: "5px 8px", color: COLORS.text, fontFamily: "monospace", fontSize: 10 }}>{s.label}</td>
                  <td style={{ padding: "5px 8px" }}>
                    <span style={{
                      padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 700,
                      background: `${COLORS.gold}15`, color: COLORS.gold, letterSpacing: 0.5,
                      textTransform: "uppercase",
                    }}>
                      {s.classification || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.text }}>{((s.confidence || 0) * 100).toFixed(0)}%</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.text }}>{s.quality_score?.toFixed(2) ?? "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.text }}>{s.peak_accel?.toFixed(1) ?? "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.text }}>{s.n_phases ?? "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.blue }}>{s.betti_0 ?? "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.purple }}>{s.betti_1 ?? "—"}</td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.text }}>{s.total_persistence?.toFixed(2) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {/* Side-by-Side Comparison */}
      {compareIds.length === 2 && (() => {
        const a = chartData.find(s => s.id === compareIds[0]);
        const b = chartData.find(s => s.id === compareIds[1]);
        if (!a || !b) return null;
        const cmpMetrics = [
          { key: "confidence", label: "Confidence", fmt: v => `${((v || 0) * 100).toFixed(0)}%` },
          { key: "quality_score", label: "Quality", fmt: v => v?.toFixed(3) ?? "—" },
          { key: "peak_accel", label: "Peak Accel (g)", fmt: v => v?.toFixed(2) ?? "—" },
          { key: "n_phases", label: "Phases", fmt: v => v ?? "—" },
          { key: "betti_0", label: "Betti-0", fmt: v => v ?? "—" },
          { key: "betti_1", label: "Betti-1", fmt: v => v ?? "—" },
          { key: "total_persistence", label: "Total Persistence", fmt: v => v?.toFixed(3) ?? "—" },
          { key: "duration_s", label: "Duration (s)", fmt: v => v?.toFixed(2) ?? "—" },
        ];
        return (
          <div style={CARD}>
            <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.gold, marginBottom: 12, letterSpacing: 0.5 }}>
              SESSION COMPARISON
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600 }}>METRIC</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: COLORS.blue, fontWeight: 600 }}>{a.label}</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: COLORS.gold, fontWeight: 600 }}>{b.label}</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", color: COLORS.textDim, fontWeight: 600 }}>DELTA</th>
                </tr>
              </thead>
              <tbody>
                {cmpMetrics.map(m => {
                  const va = a[m.key], vb = b[m.key];
                  const delta = (typeof va === "number" && typeof vb === "number") ? vb - va : null;
                  const deltaStr = delta != null ? (delta > 0 ? "+" : "") + (m.key === "confidence" ? `${(delta * 100).toFixed(1)}pp` : delta.toFixed(2)) : "—";
                  const deltaColor = delta != null ? (delta > 0.001 ? COLORS.green : delta < -0.001 ? COLORS.red : COLORS.textDim) : COLORS.textDim;
                  return (
                    <tr key={m.key} style={{ borderBottom: `1px solid ${COLORS.border}15` }}>
                      <td style={{ padding: "5px 8px", color: COLORS.textDim }}>{m.label}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.blue }}>{m.fmt(va)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", color: COLORS.gold }}>{m.fmt(vb)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", color: deltaColor, fontWeight: 600 }}>{deltaStr}</td>
                    </tr>
                  );
                })}
                <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ padding: "5px 8px", color: COLORS.textDim }}>Classification</td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>
                    <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: `${COLORS.blue}15`, color: COLORS.blue, textTransform: "uppercase" }}>
                      {a.classification || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right" }}>
                    <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: `${COLORS.gold}15`, color: COLORS.gold, textTransform: "uppercase" }}>
                      {b.classification || "—"}
                    </span>
                  </td>
                  <td style={{ padding: "5px 8px", textAlign: "right", color: a.classification === b.classification ? COLORS.green : COLORS.orange, fontSize: 10 }}>
                    {a.classification === b.classification ? "SAME" : "DIFF"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}
