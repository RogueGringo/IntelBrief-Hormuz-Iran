import { useState, useEffect, useCallback, useRef } from "react";
import { fetchSignals, fetchSwings, fetchSwing, fetchLLMStatus, fetchModels, fetchBaselines, fetchAgentDashboard, compareSwings, swapModel, triggerDistill, triggerAgentLoop, fetchAnomalies } from './DataService.jsx';
import { COLORS, CATEGORY_COLORS, CLASS_COLORS } from "./theme.js";
import MotionPatternsTab from './PatternsTab.jsx';
import SessionFeedTab from './LiveFeedTab.jsx';
import ProgressTab from './ProgressTab.jsx';
import SettingsTab from './SettingsTab.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

// ─── HEADER ────────────────────────────────────────────────
const TABS = [
  { id: 'thesis', label: 'THE THESIS' },
  { id: 'sensors', label: 'SENSOR NODES' },
  { id: 'motionPatterns', label: 'MOTION PATTERNS' },
  { id: 'modelRegistry', label: 'MODEL REGISTRY' },
  { id: 'topoChains', label: 'TOPOLOGY CHAINS' },
  { id: 'progress', label: 'PROGRESS' },
  { id: 'monitor', label: 'SIGNAL MONITOR' },
  { id: 'feed', label: 'SESSION FEED' },
  { id: 'settings', label: 'SETTINGS' },
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
      <div className="tab-bar" style={{ display: "flex", gap: 0, marginTop: 16, flexWrap: "wrap" }}>
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

function GettingStartedCard() {
  const [stats, setStats] = useState(null);
  const [sensorOk, setSensorOk] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/stats').then(r => r.json()).catch(() => null),
      fetch('/api/sensor/status').then(r => r.json()).catch(() => null),
    ]).then(([s, sensor]) => {
      setStats(s);
      setSensorOk(sensor?.connected ?? false);
    });
  }, []);

  if (!stats) return null;

  const steps = [
    { done: sensorOk, label: 'Connect PROTEUS1 sensor via USB', detail: 'Plug in the STEVAL-PROTEUS1 and check Sensor Nodes tab' },
    { done: stats.total_sessions > 0, label: 'Capture or upload a motion session', detail: 'Use Auto Capture or drag CSV files into Session Feed' },
    { done: stats.analyzed > 0, label: 'Analyze a session', detail: 'Click Analyze to extract 91 features + topological encoding' },
    { done: stats.baselines > 0, label: 'Save a baseline', detail: 'Mark a good session as baseline for comparison' },
    { done: stats.total_sessions >= 3, label: 'Build a pattern library (3+ sessions)', detail: 'More sessions = better consistency analysis in Motion Patterns' },
  ];

  const completed = steps.filter(s => s.done).length;
  const allDone = completed === steps.length;

  if (allDone) return null;

  return (
    <div style={{
      background: COLORS.surface, border: `1px solid ${COLORS.gold}40`,
      borderLeft: `3px solid ${COLORS.green}`, borderRadius: 6,
      padding: 16, marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: COLORS.green }}>
          GETTING STARTED
        </span>
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>
          {completed}/{steps.length} complete
        </span>
        <div style={{ flex: 1, height: 4, background: COLORS.border, borderRadius: 2, marginLeft: 8 }}>
          <div style={{ width: `${(completed / steps.length) * 100}%`, height: '100%', background: COLORS.green, borderRadius: 2, transition: 'width 0.3s' }} />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: step.done ? 0.5 : 1 }}>
            <span style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              background: step.done ? `${COLORS.green}20` : `${COLORS.gold}15`,
              color: step.done ? COLORS.green : COLORS.gold,
              border: `1px solid ${step.done ? COLORS.green : COLORS.gold}40`,
            }}>
              {step.done ? '\u2713' : i + 1}
            </span>
            <div>
              <div style={{ fontSize: 12, color: step.done ? COLORS.textMuted : COLORS.text, fontWeight: 600, textDecoration: step.done ? 'line-through' : 'none' }}>
                {step.label}
              </div>
              {!step.done && (
                <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 1 }}>
                  {step.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const phases = ['Idle', 'Onset', 'Load', 'Peak Load', 'Drive', 'Impact', 'Follow', 'Recovery'];

  return (
    <div style={{ padding: 20, color: COLORS.text }}>
      <GettingStartedCard />

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
            text: 'Raw 6-axis IMU data (accelerometer + gyroscope at 500Hz) → 91 extracted features. Phase detection identifies idle, onset, load, peak_load, drive, impact, follow, recovery. Full kinematic analysis from a single STEVAL-PROTEUS1 sensor node.',
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
            independent of speed or timing. Two swings that "feel the same" produce matching
            topological signatures. Topology sees structure.
          </p>
        </div>
      </div>

      {/* Section 4: Phase Transitions in Motion */}
      <div style={cardStyle}>
        <h3 style={headingStyle}>PHASE TRANSITIONS IN MOTION</h3>
        <p style={bodyStyle}>
          Every motion capture passes through 8 topological phases: Idle → Onset → Load → Peak Load →
          Drive → Impact → Follow → Recovery. Each transition is a critical point in the persistence
          diagram — a birth or death of a topological feature. The drive-to-impact transition is the
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

function LiveStreamPanel({ visible, onClose }) {
  const [samples, setSamples] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [meta, setMeta] = useState([]);
  const eventSourceRef = useRef(null);
  const maxSamples = 500;

  useEffect(() => {
    if (!visible) return;

    const es = new EventSource('/api/sensor/stream');
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'connected') {
          setStatus('streaming');
        } else if (msg.event === 'header') {
          setMeta(prev => [...prev, `Columns: ${msg.columns.join(', ')}`]);
        } else if (msg.event === 'sample') {
          setSamples(prev => {
            const next = [...prev, msg.d];
            return next.length > maxSamples ? next.slice(-maxSamples) : next;
          });
        } else if (msg.event === 'meta') {
          setMeta(prev => [...prev.slice(-10), msg.line]);
        } else if (msg.event === 'error') {
          setStatus('error: ' + msg.message);
        }
      } catch (e) { /* ignore parse errors */ }
    };

    es.onerror = () => {
      setStatus('disconnected');
      es.close();
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [visible]);

  if (!visible) return null;

  // Mini canvas-based waveform renderer for performance
  const accelData = samples.slice(-200);

  return (
    <div style={{
      padding: 16, background: COLORS.surface, borderRadius: 8,
      border: `1px solid ${COLORS.green}40`, marginBottom: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: status === 'streaming' ? COLORS.green : COLORS.red,
            boxShadow: status === 'streaming' ? `0 0 6px ${COLORS.green}` : 'none',
            animation: status === 'streaming' ? 'pulse 1.5s infinite' : 'none',
          }} />
          <span style={{ color: COLORS.gold, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
            LIVE STREAM
          </span>
          <span style={{ color: COLORS.textMuted, fontSize: 10 }}>
            {status} — {samples.length} samples
          </span>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent', border: `1px solid ${COLORS.border}`,
          color: COLORS.textMuted, fontSize: 10, padding: '3px 10px',
          borderRadius: 4, cursor: 'pointer',
        }}>CLOSE</button>
      </div>

      {/* Waveform display using inline SVG */}
      {accelData.length > 2 && (
        <div style={{ background: COLORS.bg, borderRadius: 6, padding: 8, border: `1px solid ${COLORS.border}` }}>
          <svg width="100%" height="120" viewBox={`0 0 ${accelData.length} 120`} preserveAspectRatio="none">
            {['accel_x_mg', 'accel_y_mg', 'accel_z_mg'].map((axis, ai) => {
              const color = [COLORS.red, COLORS.green, COLORS.blue][ai];
              const vals = accelData.map(s => s[axis] || 0);
              const min = Math.min(...vals);
              const max = Math.max(...vals);
              const range = max - min || 1;
              const points = vals.map((v, i) =>
                `${i},${110 - ((v - min) / range) * 100}`
              ).join(' ');
              return <polyline key={axis} points={points} fill="none" stroke={color} strokeWidth="1" opacity="0.8" />;
            })}
          </svg>
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            {['X', 'Y', 'Z'].map((a, i) => (
              <span key={a} style={{ fontSize: 9, color: [COLORS.red, COLORS.green, COLORS.blue][i] }}>
                {a}: {(accelData[accelData.length - 1]?.[`accel_${a.toLowerCase()}_mg`] || 0).toFixed(0)} mg
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Session metadata */}
      {meta.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: 60, overflow: 'auto' }}>
          {meta.slice(-5).map((m, i) => (
            <div key={i} style={{ fontSize: 9, color: COLORS.textMuted, fontFamily: 'monospace' }}>{m}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function HardwareSensorPanel() {
  const [sensor, setSensor] = useState(null);
  const [error, setError] = useState(null);
  const [showStream, setShowStream] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const resp = await fetch('/api/sensor/status');
        const data = await resp.json();
        if (active) { setSensor(data); setError(null); }
      } catch (e) {
        if (active) setError(e.message);
      }
    };
    const pollCapture = async () => {
      try {
        const resp = await fetch('/api/sensor/capture/status');
        const data = await resp.json();
        if (active) setCapturing(data.running);
      } catch (e) { /* ignore */ }
    };
    poll();
    pollCapture();
    const interval = setInterval(() => { poll(); pollCapture(); }, 3000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  if (error) return (
    <div style={{ padding: 16, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.border}`, marginBottom: 20 }}>
      <span style={{ color: COLORS.red, fontSize: 12 }}>Sensor API error: {error}</span>
    </div>
  );
  if (!sensor) return null;

  const connected = sensor.connected;
  const items = connected ? [
    { label: 'STATE', value: sensor.state || '—', color: sensor.state === 'ARMED' ? COLORS.green : sensor.state === 'CAPTURE' ? COLORS.blue : COLORS.textMuted },
    { label: 'TEMPERATURE', value: sensor.temp ? `${sensor.temp}°C` : '—', color: COLORS.text },
    { label: 'RING BUFFER', value: sensor.ring || '—', color: COLORS.text },
    { label: 'THRESHOLD', value: sensor.threshold ? `${sensor.threshold} mg` : '—', color: COLORS.gold },
    { label: 'DURATION', value: sensor.duration ? `${sensor.duration}s` : '—', color: COLORS.text },
    { label: 'IMPACT', value: sensor.impact || '—', color: sensor.impact === 'ready' ? COLORS.green : COLORS.textMuted },
    { label: 'USB', value: sensor.usb || '—', color: sensor.usb === 'yes' ? COLORS.green : COLORS.textMuted },
    { label: 'BLE', value: sensor.ble || '—', color: sensor.ble === 'yes' ? COLORS.green : COLORS.textMuted },
    { label: 'SESSION', value: sensor.session || '—', color: COLORS.text },
  ] : [];

  return (
    <div style={{ padding: 16, background: COLORS.surface, borderRadius: 8, border: `1px solid ${COLORS.border}`, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: connected ? 12 : 0 }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          background: connected ? COLORS.green : COLORS.red,
          boxShadow: connected ? `0 0 8px ${COLORS.green}` : 'none',
        }} />
        <span style={{ color: COLORS.gold, fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>
          STEVAL-PROTEUS1
        </span>
        <span style={{ color: COLORS.textMuted, fontSize: 11, letterSpacing: 0.5 }}>
          {connected ? `${sensor.port} — Sovereign Sensor v0.3.0` : 'Not connected'}
        </span>
        {connected && (
          <button onClick={() => setShowStream(!showStream)} style={{
            marginLeft: 'auto', padding: '4px 12px', borderRadius: 4, fontSize: 9,
            fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
            background: showStream ? `${COLORS.green}20` : 'transparent',
            border: `1px solid ${showStream ? COLORS.green : COLORS.border}`,
            color: showStream ? COLORS.green : COLORS.textMuted,
          }}>
            {showStream ? 'STREAMING' : 'LIVE'}
          </button>
        )}
        {connected && (
          <button onClick={() => setShowConfig(!showConfig)} style={{
            padding: '4px 12px', borderRadius: 4, fontSize: 9,
            fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
            background: showConfig ? `${COLORS.gold}20` : 'transparent',
            border: `1px solid ${showConfig ? COLORS.gold : COLORS.border}`,
            color: showConfig ? COLORS.gold : COLORS.textMuted,
          }}>
            CONFIG
          </button>
        )}
        {connected && (
          <button onClick={async (e) => {
            e.stopPropagation();
            const endpoint = capturing ? '/api/sensor/capture/stop' : '/api/sensor/capture/start';
            try {
              await fetch(endpoint, { method: 'POST' });
              setCapturing(!capturing);
            } catch (err) { /* ignore */ }
          }} style={{
            padding: '4px 12px', borderRadius: 4, fontSize: 9,
            fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
            background: capturing ? `${COLORS.red}20` : `${COLORS.green}15`,
            border: `1px solid ${capturing ? COLORS.red : COLORS.green}40`,
            color: capturing ? COLORS.red : COLORS.green,
          }}>
            {capturing ? 'STOP CAPTURE' : 'AUTO CAPTURE'}
          </button>
        )}
      </div>
      {connected && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {items.map(item => (
            <div key={item.label} style={{ padding: '6px 10px', background: COLORS.bg, borderRadius: 4, border: `1px solid ${COLORS.border}` }}>
              <div style={{ color: COLORS.textMuted, fontSize: 9, letterSpacing: 1, marginBottom: 2 }}>{item.label}</div>
              <div style={{ color: item.color, fontSize: 13, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}
      {/* Config Panel */}
      {connected && showConfig && (
        <SensorConfigPanel
          sensor={sensor}
          onCommand={async (cmd) => {
            setConfigMsg(null);
            try {
              const resp = await fetch('/api/sensor/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd }),
              });
              const data = await resp.json();
              setConfigMsg({ ok: !data.error, text: data.response || data.error });
            } catch (e) {
              setConfigMsg({ ok: false, text: e.message });
            }
          }}
          message={configMsg}
        />
      )}
      <LiveStreamPanel visible={showStream} onClose={() => setShowStream(false)} />
    </div>
  );
}

function SensorConfigPanel({ sensor, onCommand, message }) {
  const [threshold, setThreshold] = useState(sensor?.threshold || '1500');
  const [duration, setDuration] = useState(sensor?.duration || '5');
  const [cooldown, setCooldown] = useState(sensor?.cooldown || '2');

  const inputStyle = {
    width: 80, padding: '4px 8px', fontSize: 12, fontFamily: 'monospace',
    background: COLORS.bg, border: `1px solid ${COLORS.border}`,
    borderRadius: 4, color: COLORS.text, textAlign: 'center',
  };
  const btnStyle = {
    padding: '4px 10px', borderRadius: 4, fontSize: 9, fontWeight: 700,
    cursor: 'pointer', background: `${COLORS.gold}15`,
    border: `1px solid ${COLORS.gold}40`, color: COLORS.gold,
  };
  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
  };

  return (
    <div style={{
      marginTop: 10, padding: 12, background: COLORS.bg, borderRadius: 6,
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
        SENSOR CONFIGURATION
      </div>
      <div style={rowStyle}>
        <span style={{ fontSize: 11, color: COLORS.textDim, width: 80 }}>Threshold</span>
        <input style={inputStyle} value={threshold} onChange={e => setThreshold(e.target.value)} />
        <span style={{ fontSize: 10, color: COLORS.textMuted }}>mg</span>
        <button style={btnStyle} onClick={() => onCommand(`SET THRESHOLD ${threshold}`)}>SET</button>
      </div>
      <div style={rowStyle}>
        <span style={{ fontSize: 11, color: COLORS.textDim, width: 80 }}>Duration</span>
        <input style={inputStyle} value={duration} onChange={e => setDuration(e.target.value)} />
        <span style={{ fontSize: 10, color: COLORS.textMuted }}>sec</span>
        <button style={btnStyle} onClick={() => onCommand(`SET DURATION ${duration}`)}>SET</button>
      </div>
      <div style={rowStyle}>
        <span style={{ fontSize: 11, color: COLORS.textDim, width: 80 }}>Cooldown</span>
        <input style={inputStyle} value={cooldown} onChange={e => setCooldown(e.target.value)} />
        <span style={{ fontSize: 10, color: COLORS.textMuted }}>sec</span>
        <button style={btnStyle} onClick={() => onCommand(`SET COOLDOWN ${cooldown}`)}>SET</button>
      </div>
      {message && (
        <div style={{
          marginTop: 6, fontSize: 10, padding: '4px 8px', borderRadius: 4,
          background: message.ok ? `${COLORS.green}10` : `${COLORS.red}10`,
          color: message.ok ? COLORS.green : COLORS.red,
          fontFamily: 'monospace',
        }}>
          {message.text}
        </div>
      )}
    </div>
  );
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
      <HardwareSensorPanel />
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
  const [llmStatus, setLlmStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [dashboard, setDashboard] = useState('');
  const [loading, setLoading] = useState(true);
  const [distilling, setDistilling] = useState(false);
  const [distillResult, setDistillResult] = useState(null);
  const [looping, setLooping] = useState(false);
  const [loopResult, setLoopResult] = useState(null);
  const [genResult, setGenResult] = useState(null);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [status, mdls, dash] = await Promise.all([
        fetchLLMStatus(),
        fetchModels(),
        fetchAgentDashboard(),
      ]);
      setLlmStatus(status);
      setModels(mdls);
      setDashboard(typeof dash === 'string' ? dash : (dash?.stdout || dash?.output || ''));
    } catch (e) {
      console.error('ModelRegistryTab load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const status = await fetchLLMStatus();
        setLlmStatus(status);
      } catch (e) {
        console.error('LLM status refresh error:', e);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes) => {
    if (!bytes && bytes !== 0) return 'Unknown';
    const num = Number(bytes);
    if (isNaN(num)) return 'Unknown';
    if (num >= 1073741824) return (num / 1073741824).toFixed(1) + ' GB';
    if (num >= 1048576) return (num / 1048576).toFixed(1) + ' MB';
    return num + ' B';
  };

  const getModelName = (path) => {
    if (!path) return null;
    const parts = path.replace(/\\/g, '/').split('/');
    const filename = parts[parts.length - 1];
    return filename.replace(/\.gguf$/i, '');
  };

  const handleSwapModel = async (slot, model) => {
    try {
      await swapModel(slot, model.path || model.filename, getModelName(model.path || model.filename));
      const status = await fetchLLMStatus();
      setLlmStatus(status);
    } catch (e) {
      console.error('Swap model error:', e);
    }
  };

  const handleDistill = async () => {
    setDistilling(true);
    setDistillResult(null);
    try {
      const result = await triggerDistill();
      setDistillResult({ success: true, data: result });
    } catch (e) {
      setDistillResult({ success: false, error: e.message || 'Distillation failed' });
    } finally {
      setDistilling(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenResult(null);
    try {
      const result = await fetchAgentDashboard();
      setGenResult({ success: true, data: result });
    } catch (e) {
      setGenResult({ success: false, error: e.message || 'Generation failed' });
    } finally {
      setGenerating(false);
    }
  };

  const handleAgentLoop = async () => {
    setLooping(true);
    setLoopResult(null);
    try {
      const result = await triggerAgentLoop(3);
      setLoopResult({ success: true, data: result });
    } catch (e) {
      setLoopResult({ success: false, error: e.message || 'Agent loop failed' });
    } finally {
      setLooping(false);
    }
  };

  const cardStyle = {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
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

  const actionBtnStyle = {
    padding: '10px 20px',
    background: COLORS.gold,
    color: COLORS.bg,
    border: 'none',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    cursor: 'pointer',
  };

  const gpuModel = llmStatus?.gpu_model || llmStatus?.gpu?.model || null;
  const gpuLoaded = !!(gpuModel || llmStatus?.gpu?.loaded);
  const cpuModel = llmStatus?.cpu_model || llmStatus?.cpu?.model || null;
  const cpuLoaded = !!(cpuModel || llmStatus?.cpu?.loaded);

  if (loading) {
    return (
      <div style={{ padding: 20, color: COLORS.textMuted, fontSize: 13 }}>
        Loading model registry...
      </div>
    );
  }

  return (
    <div style={{ padding: 20, color: COLORS.text }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: COLORS.gold, fontSize: 20, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
          MODEL REGISTRY
        </h2>
        <p style={{ color: COLORS.textDim, fontSize: 12, margin: '4px 0 0', letterSpacing: 0.5 }}>
          LLM Inventory and Training Status
        </p>
      </div>

      {/* Active Models */}
      <div style={cardStyle}>
        <h3 style={headingStyle}>ACTIVE MODELS</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* GPU Slot */}
          <div style={{
            background: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            padding: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: gpuLoaded ? COLORS.green : COLORS.red,
              }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: COLORS.textDim }}>
                GPU SLOT
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>
              {gpuModel || 'Not loaded'}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>Backend: GPU</div>
            {gpuLoaded && (
              <div style={{ fontSize: 11, color: COLORS.green, marginTop: 4 }}>Inference: &lt;100ms</div>
            )}
          </div>

          {/* CPU Slot */}
          <div style={{
            background: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            padding: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: cpuLoaded ? COLORS.green : COLORS.red,
              }} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: COLORS.textDim }}>
                CPU SLOT
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, marginBottom: 4 }}>
              {cpuModel || 'Not loaded'}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted }}>Backend: CPU</div>
            {cpuLoaded && (
              <div style={{ fontSize: 11, color: COLORS.green, marginTop: 4 }}>Inference: 2-5s</div>
            )}
          </div>
        </div>
      </div>

      {/* Available Models */}
      <div style={cardStyle}>
        <h3 style={headingStyle}>AVAILABLE MODELS</h3>
        {models.length === 0 ? (
          <div style={{ color: COLORS.textMuted, fontSize: 12 }}>
            No GGUF models found in models directory. Place .gguf files in data/models/.
          </div>
        ) : (
          <div>
            {models.map((model, i) => {
              const name = getModelName(model.path || model.filename || model.name || `model-${i}`);
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderBottom: i < models.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{name}</div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                      {formatBytes(model.size || model.bytes)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleSwapModel('gpu', model)}
                    style={{
                      padding: '5px 12px',
                      background: `${COLORS.gold}22`,
                      color: COLORS.gold,
                      border: `1px solid ${COLORS.gold}44`,
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      cursor: 'pointer',
                    }}
                  >
                    Load GPU
                  </button>
                  <button
                    onClick={() => handleSwapModel('cpu', model)}
                    style={{
                      padding: '5px 12px',
                      background: `${COLORS.gold}22`,
                      color: COLORS.gold,
                      border: `1px solid ${COLORS.gold}44`,
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      cursor: 'pointer',
                    }}
                  >
                    Load CPU
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent Dashboard */}
      <div style={cardStyle}>
        <h3 style={headingStyle}>AGENT DASHBOARD</h3>
        {dashboard ? (
          <pre style={{
            background: '#0a0a0a',
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            padding: 16,
            fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
            fontSize: 11,
            lineHeight: 1.6,
            color: COLORS.textDim,
            overflow: 'auto',
            maxHeight: 300,
            margin: 0,
            whiteSpace: 'pre-wrap',
          }}>
            {dashboard}
          </pre>
        ) : (
          <div style={{ color: COLORS.textMuted, fontSize: 12 }}>
            Agent dashboard unavailable — sovereign-lib CLI not found.
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={cardStyle}>
        <h3 style={headingStyle}>ACTIONS</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handleDistill}
            disabled={distilling}
            style={{ ...actionBtnStyle, opacity: distilling ? 0.6 : 1 }}
          >
            {distilling ? 'Distilling...' : 'Start Distillation'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{ ...actionBtnStyle, opacity: generating ? 0.6 : 1 }}
          >
            {generating ? 'Generating...' : 'Generate Curriculum'}
          </button>
          <button
            onClick={handleAgentLoop}
            disabled={looping}
            style={{ ...actionBtnStyle, opacity: looping ? 0.6 : 1 }}
          >
            {looping ? 'Running...' : 'Run Agent Loop'}
          </button>
        </div>
        {distillResult && (
          <div style={{
            marginTop: 12, padding: 10, borderRadius: 4, fontSize: 11,
            background: distillResult.success ? `${COLORS.green}15` : `${COLORS.red}15`,
            color: distillResult.success ? COLORS.green : COLORS.red,
          }}>
            {distillResult.success
              ? (typeof distillResult.data === 'string' ? distillResult.data : 'Distillation started successfully.')
              : distillResult.error}
          </div>
        )}
        {genResult && (
          <div style={{
            marginTop: 12, padding: 10, borderRadius: 4, fontSize: 11,
            background: genResult.success ? `${COLORS.green}15` : `${COLORS.red}15`,
            color: genResult.success ? COLORS.green : COLORS.red,
          }}>
            {genResult.success
              ? (typeof genResult.data === 'string' ? genResult.data : 'Curriculum generated successfully.')
              : genResult.error}
          </div>
        )}
        {loopResult && (
          <div style={{
            marginTop: 12, padding: 10, borderRadius: 4, fontSize: 11,
            background: loopResult.success ? `${COLORS.green}15` : `${COLORS.red}15`,
            color: loopResult.success ? COLORS.green : COLORS.red,
          }}>
            {loopResult.success
              ? (typeof loopResult.data === 'string' ? loopResult.data : 'Agent loop completed successfully.')
              : loopResult.error}
          </div>
        )}
      </div>
    </div>
  );
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
            {(topo.betti_0 ?? topo.persistence?.betti_0) != null && (
              <span><span style={{ color: COLORS.blue, fontWeight: 700 }}>Betti-0:</span> {topo.betti_0 ?? topo.persistence?.betti_0}</span>
            )}
            {(topo.betti_1 ?? topo.persistence?.betti_1) != null && (
              <span><span style={{ color: COLORS.purple, fontWeight: 700 }}>Betti-1:</span> {topo.betti_1 ?? topo.persistence?.betti_1}</span>
            )}
            {(topo.total_persistence ?? topo.persistence?.total_persistence) != null && (
              <span><span style={{ color: COLORS.gold, fontWeight: 700 }}>Total Persistence:</span> {(topo.total_persistence ?? topo.persistence?.total_persistence)?.toFixed?.(4) || topo.total_persistence}</span>
            )}
            {topo.embedding && (
              <span><span style={{ color: COLORS.textMuted, fontWeight: 700 }}>Embedding:</span> {topo.embedding.length}D</span>
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
            ) : compareResult.topo_comparison ? (
              <div>
                <div style={{ display: 'flex', gap: 20, marginBottom: 8 }}>
                  <span>
                    <span style={{ color: COLORS.gold, fontWeight: 700 }}>Similarity: </span>
                    <span style={{
                      color: compareResult.topo_comparison.similarity > 0.7 ? COLORS.green
                        : compareResult.topo_comparison.similarity > 0.4 ? '#e0c040' : COLORS.red,
                      fontWeight: 700, fontSize: 16,
                    }}>
                      {(compareResult.topo_comparison.similarity * 100).toFixed(1)}%
                    </span>
                  </span>
                  <span>
                    <span style={{ color: COLORS.textMuted }}>Cosine: </span>
                    <span style={{ color: COLORS.text, fontWeight: 600 }}>{compareResult.topo_comparison.cosine_similarity?.toFixed(3)}</span>
                  </span>
                  <span>
                    <span style={{ color: COLORS.textMuted }}>L2 dist: </span>
                    <span style={{ color: COLORS.text, fontWeight: 600 }}>{compareResult.topo_comparison.l2_distance?.toFixed(3)}</span>
                  </span>
                  <span>
                    <span style={{ color: COLORS.textMuted }}>Betti match: </span>
                    <span style={{ color: compareResult.topo_comparison.betti_match ? COLORS.green : COLORS.red, fontWeight: 600 }}>
                      {compareResult.topo_comparison.betti_match ? 'Yes' : 'No'}
                    </span>
                  </span>
                </div>
                {/* Feature diff summary */}
                {compareResult.feature_diff && Object.keys(compareResult.feature_diff).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                      KEY FEATURE DELTAS
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                      {['accel_mag_max', 'gyro_mag_max', 'smoothness', 'jerk_ratio', 'accel_entropy', 'duration_s'].map(key => {
                        const d = compareResult.feature_diff[key];
                        if (!d) return null;
                        const pct = d.a !== 0 ? ((d.delta / Math.abs(d.a)) * 100) : 0;
                        return (
                          <div key={key} style={{ fontSize: 10 }}>
                            <span style={{ color: COLORS.textMuted }}>{key.replace(/_/g, ' ')}: </span>
                            <span style={{ color: pct > 10 ? COLORS.red : pct > 5 ? '#e0c040' : COLORS.green, fontWeight: 600 }}>
                              {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              {/* Side-by-side feature comparison radar */}
              {compareResult.feature_diff && (() => {
                const featureKeys = ['accel_mag_max', 'gyro_mag_max', 'smoothness', 'jerk_ratio', 'accel_entropy', 'duration_s'];
                const valid = featureKeys.filter(k => compareResult.feature_diff[k]);
                if (valid.length < 3) return null;
                const n = valid.length;
                const cx = 140, cy = 120, radius = 90;
                const normalize = (key) => {
                  const d = compareResult.feature_diff[key];
                  const maxVal = Math.max(Math.abs(d.a), Math.abs(d.b), 0.001);
                  return { a: Math.abs(d.a) / maxVal, b: Math.abs(d.b) / maxVal };
                };
                const point = (angle, r) => ({
                  x: cx + Math.cos(angle - Math.PI / 2) * r * radius,
                  y: cy + Math.sin(angle - Math.PI / 2) * r * radius,
                });
                const pathA = valid.map((k, i) => {
                  const p = point((2 * Math.PI * i) / n, normalize(k).a);
                  return `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`;
                }).join(' ') + ' Z';
                const pathB = valid.map((k, i) => {
                  const p = point((2 * Math.PI * i) / n, normalize(k).b);
                  return `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`;
                }).join(' ') + ' Z';

                return (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                      FEATURE RADAR
                    </div>
                    <svg width={280} height={240} style={{ background: COLORS.bg, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
                      {/* Grid rings */}
                      {[0.25, 0.5, 0.75, 1].map(r => (
                        <circle key={r} cx={cx} cy={cy} r={r * radius} fill="none" stroke={COLORS.border} strokeWidth={0.5} />
                      ))}
                      {/* Axis lines and labels */}
                      {valid.map((k, i) => {
                        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
                        const end = point((2 * Math.PI * i) / n, 1);
                        const labelPt = point((2 * Math.PI * i) / n, 1.15);
                        return (
                          <g key={k}>
                            <line x1={cx} y1={cy} x2={end.x} y2={end.y} stroke={COLORS.border} strokeWidth={0.5} />
                            <text x={labelPt.x} y={labelPt.y} textAnchor="middle" fill={COLORS.textMuted} fontSize={7}>{k.replace(/_/g, ' ').slice(0, 10)}</text>
                          </g>
                        );
                      })}
                      {/* Session A */}
                      <path d={pathA} fill={`${COLORS.blue}20`} stroke={COLORS.blue} strokeWidth={1.5} />
                      {/* Session B */}
                      <path d={pathB} fill={`${COLORS.gold}20`} stroke={COLORS.gold} strokeWidth={1.5} />
                    </svg>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10 }}>
                      <span style={{ color: COLORS.blue }}>&#9632; Session A</span>
                      <span style={{ color: COLORS.gold }}>&#9632; Session B</span>
                    </div>
                  </div>
                );
              })()}
              </div>
            ) : compareResult.feature_diff ? (
              <span style={{ color: '#e0c040' }}>Feature comparison available — encode both swings for topological similarity.</span>
            ) : (
              <span style={{ color: '#e0c040' }}>Both swings must be analyzed first.</span>
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

      {/* Semantic Signal Analyzer — classification is handled by backend */}
      <div style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        padding: '20px 24px',
      }}>
        <h3 style={{ color: COLORS.gold, fontSize: 13, fontWeight: 700, letterSpacing: 2, margin: '0 0 14px' }}>
          SEMANTIC SIGNAL ANALYZER
        </h3>
        <p style={{ color: COLORS.textDim, fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          Classification is handled by the backend pipeline. Upload and analyze swings via the Session Feed tab to see classification results.
        </p>
      </div>
    </div>
  );
}

// ─── STATUS BAR ────────────────────────────────────────────
function StatusBar() {
  const [health, setHealth] = useState(null);
  const [latency, setLatency] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);

  useEffect(() => {
    const check = async () => {
      const start = performance.now();
      try {
        const resp = await fetch('/api/health');
        const data = await resp.json();
        setHealth(data);
        setLatency(Math.round(performance.now() - start));
      } catch {
        setHealth(null);
        setLatency(null);
      }
      setLastCheck(new Date());
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  const analyzed = health?.analyzed ?? 0;
  const total = health?.swings ?? 0;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 26, background: '#08090d', borderTop: `1px solid ${COLORS.border}`,
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16,
      fontSize: 9, color: COLORS.textMuted, zIndex: 100,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: health ? COLORS.green : COLORS.red,
          boxShadow: health ? `0 0 4px ${COLORS.green}60` : `0 0 4px ${COLORS.red}60`,
        }} />
        {health ? 'Connected' : 'Offline'}
      </span>
      {latency != null && (
        <span style={{ color: latency < 200 ? COLORS.green : latency < 500 ? '#e0c040' : COLORS.red }}>
          {latency}ms
        </span>
      )}
      {health?.sovereign_lib && (
        <span style={{ color: COLORS.green, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 4, height: 4, borderRadius: '50%', background: COLORS.green }} />
          sovereign-lib
        </span>
      )}
      {total > 0 && (
        <span>{analyzed}/{total} analyzed</span>
      )}
      {health?.uptime_s != null && (
        <span>uptime {health.uptime_s < 3600 ? `${Math.round(health.uptime_s / 60)}m` : `${(health.uptime_s / 3600).toFixed(1)}h`}</span>
      )}
      <span style={{ marginLeft: 'auto', letterSpacing: 1, color: COLORS.gold + '80' }}>
        SOVEREIGN MOTION v1.0
      </span>
      <span style={{ color: COLORS.textMuted }}>
        [?] help
      </span>
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState('thesis');
  const [showHelp, setShowHelp] = useState(false);
  const [anomalies, setAnomalies] = useState([]);
  const [anomalyDismissed, setAnomalyDismissed] = useState(false);

  useEffect(() => {
    fetchAnomalies().then(data => {
      if (data.anomalies?.length) setAnomalies(data.anomalies);
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      const tabMap = { '1': 'thesis', '2': 'sensors', '3': 'motionPatterns', '4': 'modelRegistry', '5': 'topoChains', '6': 'progress', '7': 'monitor', '8': 'feed', '9': 'settings' };
      if (tabMap[e.key]) {
        e.preventDefault();
        setActiveTab(tabMap[e.key]);
      } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        setShowHelp(prev => !prev);
      } else if (e.key === 'Escape') {
        setShowHelp(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const SHORTCUTS = [
    { keys: '1-9', desc: 'Switch between tabs' },
    { keys: '?', desc: 'Toggle this help overlay' },
    { keys: 'Esc', desc: 'Close overlays' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.text, paddingBottom: 24 }}>
      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: COLORS.surface, border: `1px solid ${COLORS.border}`,
            borderRadius: 12, padding: 24, maxWidth: 400, width: '90%',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.gold, letterSpacing: 1, marginBottom: 16 }}>
              KEYBOARD SHORTCUTS
            </div>
            {SHORTCUTS.map(s => (
              <div key={s.keys} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${COLORS.border}22` }}>
                <kbd style={{
                  background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  borderRadius: 4, padding: '2px 8px', fontSize: 12,
                  fontFamily: 'monospace', color: COLORS.gold,
                }}>{s.keys}</kbd>
                <span style={{ fontSize: 12, color: COLORS.textDim }}>{s.desc}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 16, textAlign: 'center' }}>
              Press <kbd style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 3, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace' }}>?</kbd> or <kbd style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 3, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace' }}>Esc</kbd> to close
            </div>
          </div>
        </div>
      )}
      {/* Anomaly Alert Banner */}
      {anomalies.length > 0 && !anomalyDismissed && (
        <div style={{
          background: `${COLORS.red}15`, borderBottom: `1px solid ${COLORS.red}30`,
          padding: '8px 32px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 16 }}>&#9888;</span>
          <span style={{ fontSize: 11, color: COLORS.red, fontWeight: 600, letterSpacing: 0.5 }}>
            {anomalies.length} ANOMAL{anomalies.length === 1 ? 'Y' : 'IES'} DETECTED
          </span>
          <span style={{ fontSize: 10, color: COLORS.textDim }}>
            {anomalies.slice(0, 3).map(a => `${a.filename} (z=${a.severity})`).join(', ')}
            {anomalies.length > 3 ? ` +${anomalies.length - 3} more` : ''}
          </span>
          <button
            onClick={() => setActiveTab('progress')}
            style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, border: `1px solid ${COLORS.red}40`, borderRadius: 3, background: 'transparent', color: COLORS.red, cursor: 'pointer' }}
          >
            VIEW
          </button>
          <button
            onClick={() => setAnomalyDismissed(true)}
            style={{ padding: '3px 8px', fontSize: 11, border: 'none', background: 'transparent', color: COLORS.textMuted, cursor: 'pointer' }}
          >
            &#10005;
          </button>
        </div>
      )}
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 40px' }}>
        <ErrorBoundary key={activeTab}>
          {activeTab === 'thesis' && <ThesisTab />}
          {activeTab === 'sensors' && <SensorNodesTab />}
          {activeTab === 'motionPatterns' && <MotionPatternsTab />}
          {activeTab === 'modelRegistry' && <ModelRegistryTab />}
          {activeTab === 'topoChains' && <TopologyChainsTab />}
          {activeTab === 'progress' && <ProgressTab />}
          {activeTab === 'monitor' && <SignalMonitorTab />}
          {activeTab === 'feed' && <SessionFeedTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </ErrorBoundary>
      </div>
      <StatusBar />
    </div>
  );
}
