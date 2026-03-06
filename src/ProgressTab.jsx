import { useState, useEffect, useMemo } from "react";
import { fetchTrends } from "./DataService.jsx";
import { COLORS } from "./theme.js";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend, ReferenceLine, Area, AreaChart,
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

  return (
    <div style={{ padding: 20, color: COLORS.text }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: COLORS.gold, fontSize: 20, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
          PROGRESS TRACKING
        </h2>
        <p style={{ color: COLORS.textDim, fontSize: 12, margin: "4px 0 0", letterSpacing: 0.5 }}>
          Multi-Session Trend Analysis &middot; {sessions.length} sessions
        </p>
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

      {/* Session Table */}
      <div style={CARD}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 12, letterSpacing: 0.5 }}>
          SESSION DETAIL
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
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
    </div>
  );
}
