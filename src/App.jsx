import { useState, useEffect } from "react";
import { fetchSignals, fetchSwings, fetchSwing, fetchLLMStatus, fetchModels, fetchBaselines, fetchAgentPlan, fetchAgentDashboard, ingestSwing, analyzeSwing, coachSwing, compareSwings, swapModel, triggerDistill, triggerAgentLoop, classifyText } from './DataService.jsx';
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
  return <div style={{ padding: 20, color: COLORS.text }}>
    <h2 style={{ color: COLORS.gold }}>TOPOLOGY CHAINS</h2>
    <p style={{ color: COLORS.textDim }}>Topological signature visualization — implementation pending.</p>
  </div>;
}

function SignalMonitorTab() {
  return <div style={{ padding: 20, color: COLORS.text }}>
    <h2 style={{ color: COLORS.gold }}>SIGNAL MONITOR</h2>
    <p style={{ color: COLORS.textDim }}>Motion quality signal tracking — implementation pending.</p>
  </div>;
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
