import { useState, useEffect, useCallback } from "react";
import { fetchSwings, fetchSwing, fetchBaselines } from './DataService.jsx';
import { COLORS } from './theme.js';

const PALETTE = [
  COLORS.blue, COLORS.orange, COLORS.purple, COLORS.green,
  COLORS.red, COLORS.gold, COLORS.goldBright,
];

export default function MotionPatternsTab() {
  const [swings, setSwings] = useState([]);
  const [topoSwings, setTopoSwings] = useState([]);
  const [baselineCount, setBaselineCount] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allSwings, baselines] = await Promise.all([
        fetchSwings(),
        fetchBaselines(),
      ]);

      const swingList = Array.isArray(allSwings) ? allSwings : [];
      setSwings(swingList);

      if (baselines && !baselines.error) {
        setBaselineCount(Array.isArray(baselines) ? baselines.length : 0);
      } else {
        setBaselineCount(0);
      }

      // Fetch full details for each swing to get topology data
      const detailed = await Promise.all(
        swingList.map(s => fetchSwing(s.id))
      );
      const withTopo = detailed.filter(
        s => s && s.topology && s.topology.persistence && s.topology.persistence.pairs
      );
      setTopoSwings(withTopo);
    } catch (e) {
      console.error('MotionPatternsTab load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cardStyle = {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: '20px 24px',
    marginBottom: 20,
  };

  const headingStyle = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: COLORS.gold,
    marginBottom: 12,
  };

  const totalSwings = swings.length;
  const swingsWithTopo = topoSwings.length;

  return (
    <div style={{ padding: '32px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 22, color: COLORS.gold, margin: '0 0 6px',
        }}>
          Motion Patterns — Swing Signature Analysis
        </h2>
        <p style={{ fontSize: 13, color: COLORS.textDim, margin: 0, lineHeight: 1.5, maxWidth: 700 }}>
          Topological persistence diagrams, phase timing consistency, and swing classification overview.
        </p>
      </div>

      {/* Session Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'SWINGS ANALYZED', value: loading ? '...' : totalSwings },
          { label: 'WITH TOPOLOGY', value: loading ? '...' : swingsWithTopo },
          { label: 'BASELINES', value: loading ? '...' : (baselineCount ?? 0) },
        ].map((card, i) => (
          <div key={i} style={{
            ...cardStyle,
            marginBottom: 0,
            textAlign: 'center',
            padding: '20px 16px',
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.gold, marginBottom: 4 }}>
              {card.value}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
              color: COLORS.textMuted, textTransform: 'uppercase',
            }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Persistence Diagram */}
      <div style={cardStyle}>
        <div style={headingStyle}>PERSISTENCE DIAGRAM</div>
        {topoSwings.length === 0 ? (
          <p style={{ fontSize: 13, color: COLORS.textDim, margin: 0 }}>
            No topology data — analyze swings first
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg width={400} height={400} style={{ background: COLORS.bg, borderRadius: 8 }}>
              {/* Axes labels */}
              <text x={200} y={390} textAnchor="middle" fill={COLORS.textMuted} fontSize={10}>Birth</text>
              <text x={12} y={200} textAnchor="middle" fill={COLORS.textMuted} fontSize={10}
                transform="rotate(-90, 12, 200)">Death</text>

              {/* Grid area: 40,10 to 380,350 */}
              {/* Diagonal line (birth = death, zero persistence) */}
              <line x1={40} y1={350} x2={380} y2={10} stroke={COLORS.textMuted} strokeWidth={1}
                strokeDasharray="4,4" opacity={0.5} />

              {/* Axis lines */}
              <line x1={40} y1={350} x2={380} y2={350} stroke={COLORS.border} strokeWidth={1} />
              <line x1={40} y1={350} x2={40} y2={10} stroke={COLORS.border} strokeWidth={1} />

              {/* Persistence points */}
              {(() => {
                // Collect all pairs to determine scale
                const allPairs = [];
                topoSwings.forEach(s => {
                  (s.topology.persistence.pairs || []).forEach(p => {
                    if (p.death != null) allPairs.push(p); // Skip infinite-death pairs
                  });
                });
                if (allPairs.length === 0) return null;

                const births = allPairs.map(p => p.birth ?? 0);
                const deaths = allPairs.map(p => p.death ?? 0);
                const allVals = [...births, ...deaths].filter(v => isFinite(v));
                const minVal = Math.min(...allVals);
                const maxVal = Math.max(...allVals);
                const range = maxVal - minVal || 1;

                const scaleX = v => 40 + ((v - minVal) / range) * 340;
                const scaleY = v => 350 - ((v - minVal) / range) * 340;

                return topoSwings.map((s, si) => {
                  const color = PALETTE[si % PALETTE.length];
                  return (s.topology.persistence.pairs || []).filter(p => p.death != null).map((p, pi) => {
                    const birth = p.birth ?? 0;
                    const death = p.death ?? 0;
                    const dim = p.dimension ?? 0;
                    return (
                      <circle
                        key={`${si}-${pi}`}
                        cx={scaleX(birth)}
                        cy={scaleY(death)}
                        r={3}
                        fill={dim === 0 ? COLORS.blue : dim === 1 ? COLORS.purple : COLORS.gold}
                        opacity={0.6}
                      >
                        <title>Swing {s.id} H{dim}: birth={birth.toFixed(3)}, death={death.toFixed(3)}</title>
                      </circle>
                    );
                  });
                });
              })()}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8, fontSize: 11, color: COLORS.textDim }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.blue, display: 'inline-block' }} /> H0 (components)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.purple, display: 'inline-block' }} /> H1 (loops)
              </span>
              <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                {topoSwings.length} swing{topoSwings.length !== 1 ? 's' : ''} plotted
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Phase Timing */}
      <div style={cardStyle}>
        <div style={headingStyle}>PHASE TIMING</div>
        {(() => {
          // Extract phase data from all swings that have it
          const phaseSwings = topoSwings.filter(
            s => s.topology?.phases?.phases?.length > 0
          );
          if (phaseSwings.length === 0) {
            return (
              <p style={{ fontSize: 13, color: COLORS.textDim, margin: 0, lineHeight: 1.6 }}>
                No phase data — analyze swings first. Phase detection identifies idle, onset, load, peak_load, drive, impact, follow, recovery.
              </p>
            );
          }

          const PHASE_COLORS = {
            idle: COLORS.textMuted, onset: COLORS.blue, load: COLORS.purple,
            peak_load: COLORS.gold, drive: COLORS.orange, impact: COLORS.red,
            follow: COLORS.green, recovery: '#8b8b8b',
          };

          // Compute per-phase durations for each swing
          const phaseStats = {};
          phaseSwings.forEach(s => {
            const phases = s.topology.phases.phases;
            phases.forEach(([start, end, name]) => {
              const dur = end - start;
              if (!phaseStats[name]) phaseStats[name] = [];
              phaseStats[name].push(dur);
            });
          });

          // Calculate mean and std for each phase
          const phaseOrder = ['idle', 'onset', 'load', 'peak_load', 'drive', 'impact', 'follow', 'recovery'];
          const activePhasesOrdered = phaseOrder.filter(p => phaseStats[p]);

          const stats = activePhasesOrdered.map(name => {
            const durations = phaseStats[name];
            const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
            const std = durations.length > 1
              ? Math.sqrt(durations.reduce((sum, d) => sum + (d - mean) ** 2, 0) / (durations.length - 1))
              : 0;
            const cv = mean > 0 ? std / mean : 0;
            return { name, mean, std, cv, count: durations.length, durations };
          });

          const maxMean = Math.max(...stats.map(s => s.mean), 1);

          return (
            <div>
              {/* Phase duration bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stats.map(s => {
                  const barWidth = (s.mean / maxMean) * 100;
                  const color = PHASE_COLORS[s.name] || COLORS.textMuted;
                  const consistency = s.cv < 0.1 ? 'high' : s.cv < 0.3 ? 'medium' : 'low';
                  const consistencyColor = consistency === 'high' ? COLORS.green : consistency === 'medium' ? '#e0c040' : COLORS.red;

                  return (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 80, fontSize: 10, color: color, fontWeight: 700,
                        letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'right',
                      }}>
                        {s.name.replace('_', ' ')}
                      </span>
                      <div style={{ flex: 1, position: 'relative', height: 18 }}>
                        <div style={{
                          width: `${barWidth}%`, height: '100%', borderRadius: 3,
                          background: `${color}30`, border: `1px solid ${color}50`,
                          position: 'relative', minWidth: 2,
                        }}>
                          {/* Std deviation indicator */}
                          {s.std > 0 && (
                            <div style={{
                              position: 'absolute', right: -1, top: 2, bottom: 2,
                              width: Math.max(2, (s.std / maxMean) * 100) + '%',
                              background: `${color}15`, borderRadius: '0 3px 3px 0',
                            }} />
                          )}
                        </div>
                      </div>
                      <span style={{ width: 60, fontSize: 10, color: COLORS.textDim, textAlign: 'right', fontFamily: 'monospace' }}>
                        {s.mean.toFixed(0)} smp
                      </span>
                      {phaseSwings.length > 1 && (
                        <span style={{
                          width: 50, fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
                          color: consistencyColor, textAlign: 'center',
                          padding: '1px 4px', borderRadius: 3,
                          background: `${consistencyColor}15`,
                        }}>
                          {consistency === 'high' ? 'STABLE' : consistency === 'medium' ? 'VARY' : 'ERRATIC'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Per-swing phase timeline comparison */}
              {phaseSwings.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
                    SWING TIMELINES ({phaseSwings.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {phaseSwings.map((s, si) => {
                      const phases = s.topology.phases.phases;
                      const total = phases[phases.length - 1]?.[1] || 1;
                      return (
                        <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 50, fontSize: 9, color: COLORS.textMuted, fontFamily: 'monospace', textAlign: 'right' }}>
                            {s.id?.slice(0, 6) || `#${si + 1}`}
                          </span>
                          <div style={{ flex: 1, display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden', border: `1px solid ${COLORS.border}` }}>
                            {phases.map(([start, end, name], i) => {
                              const width = ((end - start) / total) * 100;
                              const color = PHASE_COLORS[name] || COLORS.textMuted;
                              return (
                                <div key={i} title={`${name}: ${start}-${end}`} style={{
                                  width: `${Math.max(width, 0.5)}%`,
                                  background: `${color}40`,
                                  borderRight: i < phases.length - 1 ? `1px solid ${COLORS.bg}` : 'none',
                                }} />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Phase legend */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    {activePhasesOrdered.map(name => (
                      <span key={name} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: COLORS.textMuted }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: `${PHASE_COLORS[name] || COLORS.textMuted}60` }} />
                        {name.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Signature Comparison Matrix */}
      <div style={cardStyle}>
        <div style={headingStyle}>SIGNATURE COMPARISON</div>
        {(() => {
          if (topoSwings.length < 2) {
            return (
              <p style={{ fontSize: 13, color: COLORS.textDim, margin: 0 }}>
                Need 2+ swings with topology to compare signatures. Upload and analyze more sessions.
              </p>
            );
          }

          // Feature comparison: key metrics across swings
          const featureKeys = ['accel_mag_max', 'gyro_mag_max', 'accel_mag_rms', 'smoothness', 'jerk_ratio', 'duration_s'];
          const featureLabels = { accel_mag_max: 'Peak G', gyro_mag_max: 'Peak Gyro', accel_mag_rms: 'RMS', smoothness: 'Smooth', jerk_ratio: 'Jerk', duration_s: 'Duration' };

          // Normalize features to 0-1 for radar comparison
          const featureVals = {};
          featureKeys.forEach(k => {
            const vals = topoSwings.map(s => s.features?.[k] ?? 0);
            const max = Math.max(...vals, 0.001);
            featureVals[k] = vals.map(v => v / max);
          });

          // Embedding cosine similarity matrix
          const embeddings = topoSwings.map(s => s.topology?.embedding || []);
          const cosine = (a, b) => {
            if (!a.length || !b.length || a.length !== b.length) return 0;
            let dot = 0, na = 0, nb = 0;
            for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
            const denom = Math.sqrt(na) * Math.sqrt(nb);
            return denom > 0 ? dot / denom : 0;
          };

          const n = topoSwings.length;

          return (
            <div>
              {/* Feature comparison bars */}
              <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
                FEATURE COMPARISON ({n} swings)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
                {featureKeys.map(k => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 70, fontSize: 9, color: COLORS.textMuted, textAlign: 'right', fontWeight: 600 }}>
                      {featureLabels[k]}
                    </span>
                    <div style={{ flex: 1, display: 'flex', gap: 2, alignItems: 'flex-end', height: 16 }}>
                      {featureVals[k].map((v, i) => (
                        <div key={i} style={{
                          flex: 1, height: Math.max(2, v * 16), borderRadius: 2,
                          background: PALETTE[i % PALETTE.length],
                          opacity: 0.7,
                        }} title={`${topoSwings[i].id?.slice(0, 6)}: ${topoSwings[i].features?.[k]?.toFixed(1) ?? '—'}`} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Similarity matrix */}
              <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
                TOPOLOGY SIMILARITY MATRIX
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: 4 }}></th>
                      {topoSwings.map((s, i) => (
                        <th key={i} style={{
                          padding: '4px 6px', color: PALETTE[i % PALETTE.length],
                          fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                        }}>
                          {s.id?.slice(0, 6) || `#${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topoSwings.map((s, i) => (
                      <tr key={i}>
                        <td style={{
                          padding: '4px 6px', color: PALETTE[i % PALETTE.length],
                          fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                        }}>
                          {s.id?.slice(0, 6) || `#${i + 1}`}
                        </td>
                        {topoSwings.map((t, j) => {
                          const sim = i === j ? 1.0 : cosine(embeddings[i], embeddings[j]);
                          const bg = sim > 0.9 ? COLORS.green
                            : sim > 0.7 ? '#e0c040'
                            : sim > 0.4 ? COLORS.orange
                            : COLORS.red;
                          return (
                            <td key={j} style={{
                              padding: '4px 6px', textAlign: 'center', fontFamily: 'monospace',
                              background: i === j ? `${COLORS.gold}10` : `${bg}15`,
                              color: i === j ? COLORS.textMuted : bg,
                              borderRadius: 2, fontWeight: i === j ? 400 : 600,
                            }}>
                              {i === j ? '—' : (sim * 100).toFixed(0) + '%'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 6 }}>
                Cosine similarity of 40D topological embeddings. &gt;90% = consistent pattern, &lt;50% = distinct motion.
              </div>
            </div>
          );
        })()}
      </div>

      {/* Swing Table */}
      <div style={cardStyle}>
        <div style={headingStyle}>SWING TABLE</div>
        {swings.length === 0 ? (
          <p style={{ fontSize: 13, color: COLORS.textDim, margin: 0 }}>
            No swings ingested yet. Upload CSV files in the Session Feed tab.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${COLORS.border}` }}>
                  {['ID', 'Filename', 'Status', 'Classification', 'Confidence', 'Betti-0', 'Betti-1'].map(h => (
                    <th key={h} style={{
                      padding: '8px 12px', textAlign: 'left', fontSize: 10,
                      fontWeight: 700, letterSpacing: 1, color: COLORS.gold,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {swings.map(s => {
                  const statusColor = s.status === 'analyzed' ? COLORS.green
                    : s.status === 'ingested' ? COLORS.blue
                    : s.status === 'error' ? COLORS.red
                    : COLORS.textMuted;
                  const classColor = s.classification === 'CLEAN' ? COLORS.green
                    : s.classification === 'NOISY' ? COLORS.red
                    : s.classification === 'MIXED' ? COLORS.orange
                    : s.classification === 'ANOMALY' ? COLORS.purple
                    : COLORS.textMuted;

                  // Find matching topo swing for Betti numbers
                  const topoMatch = topoSwings.find(ts => ts.id === s.id);
                  const b0 = topoMatch?.topology?.betti_0 ?? topoMatch?.topology?.persistence?.betti_0;
                  const b1 = topoMatch?.topology?.betti_1 ?? topoMatch?.topology?.persistence?.betti_1;

                  return (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '8px 12px', color: COLORS.text, fontFamily: 'monospace' }}>
                        {s.id}
                      </td>
                      <td style={{ padding: '8px 12px', color: COLORS.textDim }}>
                        {s.filename || '—'}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                          padding: '2px 8px', borderRadius: 3,
                          background: `${statusColor}15`, color: statusColor,
                        }}>
                          {(s.status || 'unknown').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                          padding: '2px 8px', borderRadius: 3,
                          background: `${classColor}15`, color: classColor,
                        }}>
                          {s.classification || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: COLORS.textDim }}>
                        {s.confidence != null ? `${s.confidence}%` : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: COLORS.blue, fontFamily: 'monospace', fontSize: 11 }}>
                        {b0 != null ? b0 : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: COLORS.purple, fontFamily: 'monospace', fontSize: 11 }}>
                        {b1 != null ? b1 : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
