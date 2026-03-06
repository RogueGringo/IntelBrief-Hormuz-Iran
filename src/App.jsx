import { useState } from "react";
import { fetchSignals, fetchSwings, fetchSwing, fetchLLMStatus, fetchModels, fetchBaselines, fetchAgentPlan, fetchAgentDashboard, ingestSwing, analyzeSwing, coachSwing, compareSwings, swapModel, triggerDistill, triggerAgentLoop, classifyText } from './DataService.jsx';
import { COLORS, CATEGORY_COLORS, CLASS_COLORS } from "./theme.js";

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
  return <div style={{ padding: 20, color: COLORS.text }}>
    <h2 style={{ color: COLORS.gold }}>THE THESIS</h2>
    <p style={{ color: COLORS.textDim }}>Topological motion analysis framework — implementation pending.</p>
  </div>;
}

function SensorNodesTab() {
  return <div style={{ padding: 20, color: COLORS.text }}>
    <h2 style={{ color: COLORS.gold }}>SENSOR NODES</h2>
    <p style={{ color: COLORS.textDim }}>Motion pipeline health monitoring — implementation pending.</p>
  </div>;
}

function MotionPatternsTab() {
  return <div style={{ padding: 20, color: COLORS.text }}>
    <h2 style={{ color: COLORS.gold }}>MOTION PATTERNS</h2>
    <p style={{ color: COLORS.textDim }}>Historical swing signature analysis — implementation pending.</p>
  </div>;
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
