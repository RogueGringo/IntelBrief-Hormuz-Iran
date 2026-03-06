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
          <div style={{ display: 'flex', justifyContent: 'center' }}>
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
                    allPairs.push(p);
                  });
                });
                if (allPairs.length === 0) return null;

                const births = allPairs.map(p => p.birth != null ? p.birth : p[0]);
                const deaths = allPairs.map(p => p.death != null ? p.death : p[1]);
                const allVals = [...births, ...deaths];
                const minVal = Math.min(...allVals);
                const maxVal = Math.max(...allVals);
                const range = maxVal - minVal || 1;

                const scaleX = v => 40 + ((v - minVal) / range) * 340;
                const scaleY = v => 350 - ((v - minVal) / range) * 340;

                return topoSwings.map((s, si) => {
                  const color = PALETTE[si % PALETTE.length];
                  return (s.topology.persistence.pairs || []).map((p, pi) => {
                    const birth = p.birth != null ? p.birth : p[0];
                    const death = p.death != null ? p.death : p[1];
                    return (
                      <circle
                        key={`${si}-${pi}`}
                        cx={scaleX(birth)}
                        cy={scaleY(death)}
                        r={4}
                        fill={color}
                        opacity={0.75}
                      >
                        <title>Swing {s.id}: birth={birth.toFixed(3)}, death={death.toFixed(3)}</title>
                      </circle>
                    );
                  });
                });
              })()}
            </svg>
          </div>
        )}
      </div>

      {/* Phase Timing */}
      <div style={cardStyle}>
        <div style={headingStyle}>PHASE TIMING</div>
        <p style={{ fontSize: 13, color: COLORS.textDim, margin: 0, lineHeight: 1.6 }}>
          Phase timing consistency analysis available after multiple swings are analyzed.
        </p>
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
                  {['ID', 'Filename', 'Status', 'Classification', 'Confidence'].map(h => (
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
