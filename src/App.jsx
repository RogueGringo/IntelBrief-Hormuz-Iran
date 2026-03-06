import { useState, useEffect, useCallback } from "react";
import { fetchSignals, fetchSwings, fetchSwing, fetchLLMStatus, fetchModels, fetchBaselines, fetchAgentPlan, fetchAgentDashboard, ingestSwing, analyzeSwing, coachSwing, compareSwings, swapModel, triggerDistill, triggerAgentLoop, classifyText, CHAIN_TERMS } from './DataService.jsx';
import { COLORS, CATEGORY_COLORS, CLASS_COLORS } from "./theme.js";
import MotionPatternsTab from './PatternsTab.jsx';

// ─── HEADER ────────────────────────────────────────────────
const TABS = [
  { id: 'thesis', label: 'THE THESIS' },
  { id: 'sensors', label: 'SENSOR NODES' },
  { id: 'motionPatterns', label: 'MOTION PATTERNS' },
  { id: 'modelRegistry', label: 'MODEL REGISTRY' },
  { id: 'topoChains', label: 'TOPOLOGY CHAINS' },
  { id: 'monitor', label: 'SIGNAL MONITOR' },
  { id: 'feed', label: 'SESSION FEED' },
];

function Header({ activeTab, setActiveTab }) {
  return (
    <div style={{ borderBottom: `1px solid ${COLORS.border}`, padding: "24px 32px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 4 }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 28, fontWeight: 700, color: COLORS.gold, letterSpacing: -0.5 }}>
          SOVEREIGN MOTION
        </span>
        <span style={{ fontSize: 11, color: COLORS.textMuted, letterSpacing: 3, textTransform: "uppercase" }}>
          Topological Motion Intelligence
        </span>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 9, letterSpacing: 1, padding: "2px 8px", borderRadius: 3,
          background: `${COLORS.green}15`, color: COLORS.green, fontWeight: 700,
          marginLeft: "auto",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.green, animation: "pulse 2s infinite" }} />
          CONTINUOUS UPDATE
        </span>
      </div>
      <div style={{ display: "flex", gap: 0, marginTop: 16 }}>
        {TABS.map((t) => (
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

// ─── STUB TAB COMPONENTS ───────────────────────────────────

function ThesisTab() {
  const cardStyle = {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderLeft: `3px solid ${COLORS.gold}`,
    borderRadius: 6,
    padding: 16,
    marginBottom: 20,
  };
  const headingStyle = {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 2,
    color: COLORS.gold,
    marginBottom: 12,
    marginTop: 0,
  };
  const bodyStyle = {
    fontSize: 13,
    lineHeight: 1.7,
    color: COLORS.textDim,
    margin: 0,
  };

  const phases = ['Address', 'Backswing', 'Top', 'Downswing', 'Impact', 'Follow-Through', 'Finish'];

  return (
    <div style={{ padding: 20, color: COLORS.text }}>

      {/* Section 1: Core Thesis */}
      <div style={cardStyle}>
        <h3 style={headingStyle}>TOPOLOGICAL MOTION INTELLIGENCE</h3>
        <p style={bodyStyle}>
          A $50 IMU sensor captures motion patterns that persistent homology encodes into mathematical
          invariants — structures that raw statistics miss. During phase transitions in athletic motion,
          topology-trackers see the change before metric-trackers measure it.
        </p>
      </div>

      {/* Section 2: The Pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        {[
          {
            title: 'SENSE',
            text: 'Raw 6-axis IMU data (accelerometer + gyroscope) → 90 extracted features. Phase detection identifies address, backswing, top, downswing, impact, follow-through, finish. Kinematic chain reconstruction from a single wrist sensor.',
          },
          {
            title: 'ENCODE',
            text: 'Point clouds from feature space → persistent homology computes birth-death pairs across dimensions. H0 (connected components), H1 (loops), H2 (voids). Sheaf cohomology measures per-joint coherence. CST fields detect discontinuities.',
          },
          {
            title: 'REMEMBER',
            text: 'Topological signatures become training signal for LLM distillation. Teacher model (CPU, 32B) identifies knowledge gaps. Student model (GPU, 8B) learns motion structure through progressive curriculum. Mastery verified topologically.',
          },
        ].map((item) => (
          <div key={item.title} style={cardStyle}>
            <h3 style={headingStyle}>{item.title}</h3>
            <p style={bodyStyle}>{item.text}</p>
          </div>
        ))}
      </div>

      {/* Section 3: Why Topology? */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ ...cardStyle, borderLeft: `3px solid ${COLORS.redDim}` }}>
          <h3 style={{ ...headingStyle, color: COLORS.redDim }}>RAW STATISTICS</h3>
          <p style={bodyStyle}>
            Peak acceleration, RMS values, mean angular velocity — these vary with sensor placement,
            swing speed, and timing. Two identical swings produce different raw traces. Statistics see noise.
          </p>
        </div>
        <div style={{ ...cardStyle, borderLeft: `3px solid ${COLORS.green}` }}>
          <h3 style={{ ...headingStyle, color: COLORS.green }}>TOPOLOGICAL INVARIANTS</h3>
          <p style={bodyStyle}>
            Betti numbers, persistence lifetimes, sheaf coherence — these capture the shape of motion
            independent of speed or timing. Two swings that “feel the same” produce matching
            topological signatures. Topology sees structure.
          </p>
        </div>
      </div>

      {/* Section 4: Phase Transitions in Motion */}
      <div style={cardStyle}>
        <h3 style={headingStyle}>PHASE TRANSITIONS IN MOTION</h3>
        <p style={bodyStyle}>
          Every golf swing passes through 7 topological states: Address → Backswing → Top → Downswing →
          Impact → Follow-Through → Finish. Each transition is a critical point in the persistence
          diagram — a birth or death of a topological feature. The downswing-to-impact transition is the
          highest-energy phase boundary, where the most persistent H1 loops collapse.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
          {phases.map((phase, i) => (
            <span key={phase} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1,
                padding: '4px 10px',
                borderRadius: 4,
                background: `${COLORS.gold}18`,
                color: COLORS.gold,
                border: `1px solid ${COLORS.gold}40`,
                whiteSpace: 'nowrap',
              }}>
                {phase}
              </span>
              {i < phases.length - 1 && (
                <span style={{ color: COLORS.textMuted, fontSize: 14 }}>{'→'}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Section 5: Signal vs Noise */}
      <div style={cardStyle}>
        <h3 style={headingStyle}>SIGNAL VS NOISE</h3>
        <p style={bodyStyle}>
          <span style={{ color: COLORS.green, fontWeight: 700 }}>CLEAN</span> data has high persistence
          lifetime and sheaf coherence — the topology is rich and stable.{' '}
          <span style={{ color: COLORS.red, fontWeight: 700 }}>NOISY</span> data has degenerate topology
          and low coherence — sensor artifacts dominate the signal. The classification engine separates
          them, first by keyword scoring, then by LLM semantic analysis.
        </p>
      </div>
    </div>
  );
}

const SEVERITY_COLORS = {
  green: COLORS.green,
  yellow: '#e0c040',
  red: COLORS.red,
  unknown: COLORS.textMuted,
};

const CATEGORY_ORDER = ['imu', 'features', 'topology', 'llm', 'data'];
const CATEGORY_LABELS = {
  imu: 'IMU Health',
  features: 'Feature Pipeline',
  topology: 'Topology Engine',
  llm: 'LLM Status',
  data: 'Data Inventory',
};

const SEVERITY_RANK = { red: 3, yellow: 2, green: 1, unknown: 0 };

function worstSeverity(signals) {
  let worst = 'unknown';
  for (const s of signals) {
    if ((SEVERITY_RANK[s.severity] || 0) > (SEVERITY_RANK[worst] || 0)) {
      worst = s.severity;
    }
  }
  return worst;
}

function SensorNodesTab() {
  const [signalData, setSignalData] = useState({ signals: [], categories: {} });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(() => {
    const init = {};
    CATEGORY_ORDER.forEach(c => { init[c] = true; });
    return init;
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await fetchSignals();
      if (active) {
        setSignalData(data);
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const toggleCategory = (cat) => {
    setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const grouped = {};
  CATEGORY_ORDER.forEach(c => { grouped[c] = []; });
  (signalData.signals || []).forEach(s => {
    if (grouped[s.category]) grouped[s.category].push(s);
  });

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: COLORS.gold, fontSize: 20, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
          SENSOR NODES
        </h2>
        <p style={{ color: COLORS.textDim, fontSize: 12, margin: '4px 0 0', letterSpacing: 0.5 }}>
          Motion Pipeline Health
        </p>
      </div>

      {loading ? (
        <div style={{ color: COLORS.textMuted, fontSize: 13, padding: 20 }}>Loading signals...</div>
      ) : (
        CATEGORY_ORDER.map(cat => {
          const signals = grouped[cat];
          const worst = worstSeverity(signals);
          const catColor = CATEGORY_COLORS[cat] || COLORS.textMuted;
          const isExpanded = expanded[cat];

          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div
                onClick={() => toggleCategory(cat)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 16px',
                  background: COLORS.surface,
                  borderLeft: `3px solid ${catColor}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <span style={{ color: COLORS.textMuted, fontSize: 10, width: 12, textAlign: 'center' }}>
                  {isExpanded ? '\u25BC' : '\u25B6'}
                </span>
                <span style={{ color: COLORS.gold, fontSize: 13, fontWeight: 700, letterSpacing: 1, flex: 1 }}>
                  {CATEGORY_LABELS[cat] || cat}
                </span>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: SEVERITY_COLORS[worst] || SEVERITY_COLORS.unknown,
                }} />
                <span style={{ color: COLORS.textMuted, fontSize: 10, letterSpacing: 0.5 }}>
                  {signals.length} signals
                </span>
              </div>

              {isExpanded && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  padding: '8px 0 0 0',
                }}>
                  {signals.map(sig => (
                    <div key={sig.id} style={{
                      background: COLORS.surface,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 6,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: SEVERITY_COLORS[sig.severity] || SEVERITY_COLORS.unknown,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: COLORS.textDim, fontSize: 11, letterSpacing: 0.3 }}>
                          {sig.label}
                        </div>
                        <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                          {sig.value}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function ModelRegistryTab() {
  return <div style={{ padding: 20, color: COLORS.text }}>
    <h2 style={{ color: COLORS.gold }}>MODEL REGISTRY</h2>
    <p style={{ color: COLORS.textDim }}>LLM inventory and training status — implementation pending.</p>
  </div>;
}

function TopologyChainsTab() {
  const [swings, setSwings] = useState([]);
  const [selectedSwingId, setSelectedSwingId] = useState('');
  const [swingData, setSwingData] = useState(null);
  const [activeChain, setActiveChain] = useState('imu_integrity');
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');
  const [compareResult, setCompareResult] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [loading, setLoading] = useState(false);

  const CHAINS = [
    { id: 'imu_integrity', label: 'IMU Integrity', cascade: 'Sensor health \u2192 Feature reliability \u2192 Topology validity' },
    { id: 'kinematic', label: 'Kinematic', cascade: 'Phase detection \u2192 Segment modeling \u2192 Motion reconstruction' },
    { id: 'persistence', label: 'Persistence', cascade: 'Point cloud quality \u2192 Homology computation \u2192 Signature stability' },
    { id: 'sheaf_coherence', label: 'Sheaf Coherence', cascade: 'Joint fiber bundles \u2192 Restriction maps \u2192 Global coherence' },
    { id: 'llm_confidence', label: 'LLM Confidence', cascade: 'Embedding quality \u2192 Classification certainty \u2192 Coaching reliability' },
  ];

  useEffect(() => {
    fetchSwings().then(data => setSwings(data || []));
  }, []);

  useEffect(() => {
    if (!selectedSwingId) { setSwingData(null); return; }
    setLoading(true);
    fetchSwing(selectedSwingId).then(data => {
      setSwingData(data);
      setLoading(false);
    });
  }, [selectedSwingId]);

  const handleCompare = async () => {
    if (!compareA || !compareB) return;
    setComparing(true);
    setCompareResult(null);
    try {
      const result = await compareSwings(compareA, compareB);
      setCompareResult(result);
    } catch (e) {
      setCompareResult({ error: e.message });
    }
    setComparing(false);
  };

  const cardStyle = {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 6,
    padding: 16,
    marginBottom: 16,
  };

  const selectStyle = {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 4,
    color: COLORS.text,
    padding: '6px 10px',
    fontSize: 12,
    minWidth: 200,
  };

  const topo = swingData?.topology;

  const dimColors = [COLORS.blue, COLORS.purple, COLORS.gold];

  const coherenceColor = (v) => v > 0.8 ? COLORS.green : v >= 0.5 ? '#e0c040' : COLORS.red;

  return (
    <div style={{ padding: 20, color: COLORS.text }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: COLORS.gold, fontSize: 20, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
          TOPOLOGY CHAINS
        </h2>
        <p style={{ color: COLORS.textDim, fontSize: 12, margin: '4px 0 0', letterSpacing: 0.5 }}>
          Topological Signature Visualization
        </p>
      </div>

      {/* Chain Selector */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {CHAINS.map(ch => (
            <button
              key={ch.id}
              onClick={() => setActiveChain(ch.id)}
              style={{
                flex: 1,
                padding: '8px 6px',
                background: activeChain === ch.id ? `${COLORS.gold}20` : 'transparent',
                border: `1px solid ${activeChain === ch.id ? COLORS.gold : COLORS.border}`,
                borderRadius: 4,
                color: activeChain === ch.id ? COLORS.gold : COLORS.textDim,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: 0.8,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {ch.label}
            </button>
          ))}
        </div>
        <div style={{
          background: `${COLORS.gold}08`,
          border: `1px solid ${COLORS.gold}30`,
          borderRadius: 4,
          padding: '10px 14px',
          fontSize: 12,
          color: COLORS.textDim,
          letterSpacing: 0.5,
        }}>
          {CHAINS.find(c => c.id === activeChain)?.cascade}
        </div>
      </div>

      {/* Swing Selector */}
      <div style={{ ...cardStyle, borderLeft: `3px solid ${COLORS.gold}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: COLORS.gold, marginBottom: 10 }}>
          SWING SELECTOR
        </div>
        <select
          value={selectedSwingId}
          onChange={e => setSelectedSwingId(e.target.value)}
          style={selectStyle}
        >
          <option value="">-- Select a swing --</option>
          {swings.map(s => (
            <option key={s.id} value={s.id}>
              {s.label || s.filename || `Swing ${s.id}`}
            </option>
          ))}
        </select>
        {loading && <span style={{ color: COLORS.textMuted, fontSize: 11, marginLeft: 12 }}>Loading...</span>}
      </div>

      {/* No topology state */}
      {selectedSwingId && swingData && !topo && !loading && (
        <div style={{ ...cardStyle, borderLeft: `3px solid #e0c040` }}>
          <p style={{ color: '#e0c040', fontSize: 13, margin: 0 }}>
            Topology not computed. Run &apos;Analyze&apos; from the Session Feed tab first.
          </p>
        </div>
      )}

      {/* Persistence Diagram */}
      {topo?.persistence && (
        <div style={{ ...cardStyle, borderLeft: `3px solid ${COLORS.purple}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: COLORS.purple, marginBottom: 10 }}>
            PERSISTENCE DIAGRAM
          </div>
          <svg width={400} height={300} style={{ background: COLORS.bg, borderRadius: 4, border: `1px solid ${COLORS.border}` }}>
            {/* Diagonal */}
            <line x1={40} y1={260} x2={380} y2={20} stroke={COLORS.textMuted} strokeWidth={1} strokeDasharray="4,4" />
            {/* Axes */}
            <line x1={40} y1={260} x2={380} y2={260} stroke={COLORS.border} strokeWidth={1} />
            <line x1={40} y1={260} x2={40} y2={20} stroke={COLORS.border} strokeWidth={1} />
            <text x={210} y={290} textAnchor="middle" fill={COLORS.textMuted} fontSize={10}>Birth</text>
            <text x={12} y={140} textAnchor="middle" fill={COLORS.textMuted} fontSize={10} transform="rotate(-90,12,140)">Death</text>
            {/* Points */}
            {(topo.persistence.pairs || []).map((p, i) => {
              const maxVal = Math.max(
                ...((topo.persistence.pairs || []).flatMap(pp => [pp.birth || 0, pp.death || 0])),
                1
              );
              const x = 40 + ((p.birth || 0) / maxVal) * 340;
              const y = 260 - ((p.death || 0) / maxVal) * 240;
              const dim = p.dimension ?? 0;
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={4}
                  fill={dimColors[dim] || COLORS.textMuted}
                  opacity={0.8}
                />
              );
            })}
          </svg>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.blue, display: 'inline-block' }} /> H0
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.purple, display: 'inline-block' }} /> H1
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.gold, display: 'inline-block' }} /> H2
            </span>
          </div>
          {/* Betti numbers and total persistence */}
          <div style={{ display: 'flex', gap: 24, marginTop: 10, fontSize: 12, color: COLORS.textDim }}>
            {topo.persistence.betti_0 != null && (
              <span><span style={{ color: COLORS.blue, fontWeight: 700 }}>Betti-0:</span> {topo.persistence.betti_0}</span>
            )}
            {topo.persistence.betti_1 != null && (
              <span><span style={{ color: COLORS.purple, fontWeight: 700 }}>Betti-1:</span> {topo.persistence.betti_1}</span>
            )}
            {topo.persistence.total_persistence != null && (
              <span><span style={{ color: COLORS.gold, fontWeight: 700 }}>Total Persistence:</span> {topo.persistence.total_persistence.toFixed(4)}</span>
            )}
          </div>
        </div>
      )}

      {/* Sheaf Coherence */}
      {topo?.sheaf && (
        <div style={{ ...cardStyle, borderLeft: `3px solid ${COLORS.green}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: COLORS.green, marginBottom: 10 }}>
            SHEAF COHERENCE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              flex: 1, height: 20, background: COLORS.bg, borderRadius: 4,
              border: `1px solid ${COLORS.border}`, overflow: 'hidden',
            }}>
              <div style={{
                width: `${(topo.sheaf.global_coherence || 0) * 100}%`,
                height: '100%',
                background: coherenceColor(topo.sheaf.global_coherence || 0),
                borderRadius: 4,
                transition: 'width 0.3s',
              }} />
            </div>
            <span style={{
              fontSize: 14, fontWeight: 700, minWidth: 50, textAlign: 'right',
              color: coherenceColor(topo.sheaf.global_coherence || 0),
            }}>
              {((topo.sheaf.global_coherence || 0) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* CST Report */}
      {topo?.cst_report && (
        <div style={{ ...cardStyle, borderLeft: `3px solid ${topo.cst_report.n_discontinuities === 0 ? COLORS.green : COLORS.red}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: COLORS.gold, marginBottom: 10 }}>
            CST REPORT
          </div>
          {topo.cst_report.n_discontinuities === 0 ? (
            <span style={{ color: COLORS.green, fontSize: 13, fontWeight: 600 }}>No discontinuities detected</span>
          ) : (
            <span style={{ color: topo.cst_report.n_discontinuities > 2 ? COLORS.red : '#e0c040', fontSize: 13, fontWeight: 600 }}>
              {topo.cst_report.n_discontinuities} discontinuit{topo.cst_report.n_discontinuities === 1 ? 'y' : 'ies'} detected
            </span>
          )}
        </div>
      )}

      {/* Comparison */}
      <div style={{ ...cardStyle, borderLeft: `3px solid ${COLORS.blue}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: COLORS.blue, marginBottom: 10 }}>
          SWING COMPARISON
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={compareA} onChange={e => setCompareA(e.target.value)} style={selectStyle}>
            <option value="">-- Swing A --</option>
            {swings.map(s => (
              <option key={s.id} value={s.id}>{s.label || s.filename || `Swing ${s.id}`}</option>
            ))}
          </select>
          <span style={{ color: COLORS.textMuted, fontSize: 12 }}>vs</span>
          <select value={compareB} onChange={e => setCompareB(e.target.value)} style={selectStyle}>
            <option value="">-- Swing B --</option>
            {swings.map(s => (
              <option key={s.id} value={s.id}>{s.label || s.filename || `Swing ${s.id}`}</option>
            ))}
          </select>
          <button
            onClick={handleCompare}
            disabled={!compareA || !compareB || comparing}
            style={{
              padding: '6px 16px',
              background: compareA && compareB ? COLORS.gold : COLORS.border,
              color: compareA && compareB ? COLORS.bg : COLORS.textMuted,
              border: 'none',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              cursor: compareA && compareB ? 'pointer' : 'not-allowed',
            }}
          >
            {comparing ? 'Comparing...' : 'Compare'}
          </button>
        </div>
        {compareResult && (
          <div style={{ marginTop: 12, fontSize: 12, color: COLORS.textDim }}>
            {compareResult.error ? (
              <span style={{ color: COLORS.red }}>{compareResult.error}</span>
            ) : compareResult.delta_persistence != null ? (
              <div>
                <span style={{ color: COLORS.gold, fontWeight: 700 }}>Delta Persistence: </span>
                <span style={{ color: COLORS.text, fontWeight: 700 }}>{compareResult.delta_persistence.toFixed(4)}</span>
              </div>
            ) : (
              <span style={{ color: '#e0c040' }}>Both swings must be encoded first.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SignalMonitorTab() {
  const [signalData, setSignalData] = useState({ signals: [], categories: {} });
  const [filter, setFilter] = useState('all');
  const [analyzerText, setAnalyzerText] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await fetchSignals();
      if (active) setSignalData(data);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const handleAnalyze = useCallback(() => {
    if (!analyzerText.trim()) return;
    setAnalysisResult(classifyText(analyzerText));
  }, [analyzerText]);

  const signals = signalData.signals || [];
  const filtered = filter === 'all' ? signals : signals.filter(s => s.category === filter);
  const greenCount = signals.filter(s => s.severity === 'green').length;
  const coherence = signals.length > 0 ? Math.round((greenCount / signals.length) * 100) : 0;
  const coherenceColor = coherence >= 80 ? COLORS.green : coherence >= 50 ? '#e0c040' : COLORS.red;

  const filterButtons = ['all', 'imu', 'features', 'topology', 'llm', 'data'];

  return (
    <div style={{ padding: '24px 0', color: COLORS.text }}>

      {/* System Status Header */}
      <div style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        padding: '20px 24px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{ color: COLORS.gold, fontSize: 20, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
            SIGNAL MONITOR
          </h2>
          <p style={{ color: COLORS.textDim, fontSize: 12, margin: '4px 0 0', letterSpacing: 0.5 }}>
            Motion Quality Tracking
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: coherenceColor, letterSpacing: -1 }}>
            {coherence}%
          </div>
          <div style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1 }}>COHERENCE</div>
        </div>
      </div>

      {/* Filter Controls */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {filterButtons.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              border: `1px solid ${filter === f ? COLORS.gold : COLORS.border}`,
              background: filter === f ? `${COLORS.gold}20` : COLORS.surface,
              color: filter === f ? COLORS.gold : COLORS.textMuted,
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Signal Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 28 }}>
        {filtered.map(sig => {
          const catColor = CATEGORY_COLORS[sig.category] || COLORS.textMuted;
          const sevColor = SEVERITY_COLORS[sig.severity] || SEVERITY_COLORS.unknown;
          return (
            <div key={sig.id} style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                background: catColor,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: COLORS.textDim, fontSize: 11, letterSpacing: 0.3 }}>
                  {sig.label}
                </div>
                <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 700, marginTop: 3 }}>
                  {sig.value}
                </div>
              </div>
              <span style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                background: sevColor,
              }} />
            </div>
          );
        })}
      </div>

      {/* Semantic Signal Analyzer */}
      <div style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        padding: '20px 24px',
      }}>
        <h3 style={{ color: COLORS.gold, fontSize: 13, fontWeight: 700, letterSpacing: 2, margin: '0 0 14px' }}>
          SEMANTIC SIGNAL ANALYZER
        </h3>
        <textarea
          value={analyzerText}
          onChange={e => setAnalyzerText(e.target.value)}
          rows={4}
          placeholder="Paste motion data notes for classification..."
          style={{
            width: '100%',
            background: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            color: COLORS.text,
            fontSize: 13,
            padding: '10px 12px',
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleAnalyze}
          style={{
            marginTop: 10,
            padding: '8px 24px',
            background: `${COLORS.gold}20`,
            border: `1px solid ${COLORS.gold}`,
            borderRadius: 4,
            color: COLORS.gold,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.5,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Analyze
        </button>

        {analysisResult && (
          <div style={{
            marginTop: 16,
            padding: '14px 16px',
            background: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            <span style={{
              padding: '4px 12px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              background: `${CLASS_COLORS[analysisResult.classification] || COLORS.textMuted}20`,
              color: CLASS_COLORS[analysisResult.classification] || COLORS.textMuted,
              border: `1px solid ${CLASS_COLORS[analysisResult.classification] || COLORS.textMuted}40`,
            }}>
              {analysisResult.classification}
            </span>
            <span style={{ color: COLORS.textDim, fontSize: 12 }}>
              Confidence: <span style={{ color: COLORS.text, fontWeight: 700 }}>{analysisResult.confidence}%</span>
            </span>
            <span style={{ color: COLORS.textDim, fontSize: 12 }}>
              Clean: <span style={{ color: COLORS.green, fontWeight: 700 }}>{analysisResult.cleanHits}</span>
            </span>
            <span style={{ color: COLORS.textDim, fontSize: 12 }}>
              Noisy: <span style={{ color: COLORS.red, fontWeight: 700 }}>{analysisResult.noisyHits}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionFeedTab() {
  return <div style={{ padding: 20, color: COLORS.text }}>
    <h2 style={{ color: COLORS.gold }}>SESSION FEED</h2>
    <p style={{ color: COLORS.textDim }}>Swing-by-swing session log — implementation pending.</p>
  </div>;
}

// ─── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState('thesis');
  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text }}>
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 40px' }}>
        {activeTab === 'thesis' && <ThesisTab />}
        {activeTab === 'sensors' && <SensorNodesTab />}
        {activeTab === 'motionPatterns' && <MotionPatternsTab />}
        {activeTab === 'modelRegistry' && <ModelRegistryTab />}
        {activeTab === 'topoChains' && <TopologyChainsTab />}
        {activeTab === 'monitor' && <SignalMonitorTab />}
        {activeTab === 'feed' && <SessionFeedTab />}
      </div>
    </div>
  );
}
