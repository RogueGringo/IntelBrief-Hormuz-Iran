import { useState, useEffect } from "react";
import { COLORS } from "./theme.js";
import { useToast } from "./Toasts.jsx";

const CARD = {
  background: COLORS.surface,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};

const INPUT = {
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 4,
  color: COLORS.text,
  padding: "6px 10px",
  fontSize: 12,
  fontFamily: "monospace",
  width: 100,
};

const TOGGLE = (on) => ({
  width: 36,
  height: 20,
  borderRadius: 10,
  background: on ? COLORS.green : COLORS.border,
  border: "none",
  cursor: "pointer",
  position: "relative",
  transition: "background 0.2s",
  flexShrink: 0,
});

const TOGGLE_DOT = (on) => ({
  position: "absolute",
  top: 2,
  left: on ? 18 : 2,
  width: 16,
  height: 16,
  borderRadius: "50%",
  background: "#fff",
  transition: "left 0.2s",
});

function SettingRow({ label, description, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${COLORS.border}22` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: COLORS.text, fontWeight: 600 }}>{label}</div>
        {description && <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ marginLeft: 16, flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button style={TOGGLE(value)} onClick={() => onChange(!value)}>
      <div style={TOGGLE_DOT(value)} />
    </button>
  );
}

export default function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { addToast } = useToast();
  const [health, setHealth] = useState(null);
  const [webhooks, setWebhooks] = useState([]);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/settings").then(r => r.json()).catch(() => null),
      fetch("/api/health").then(r => r.json()).catch(() => null),
      fetch("/api/webhooks").then(r => r.json()).catch(() => []),
    ]).then(([s, h, wh]) => {
      setSettings(s);
      setHealth(h);
      setWebhooks(Array.isArray(wh) ? wh : []);
      setLoading(false);
    });
  }, []);

  const update = (section, key, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: value },
    }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      addToast("Settings saved", "success");
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      addToast("Failed to save settings", "error");
      console.error("Save settings failed:", e);
    }
    setSaving(false);
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: COLORS.textDim }}>Loading settings...</div>;
  }

  const s = settings || {};
  const sensor = s.sensor || {};
  const analysis = s.analysis || {};
  const display = s.display || {};
  const exp = s.export || {};

  return (
    <div style={{ padding: 20, color: COLORS.text, maxWidth: 700 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ color: COLORS.gold, fontSize: 20, fontWeight: 700, letterSpacing: 1, margin: 0 }}>
            SETTINGS
          </h2>
          <p style={{ color: COLORS.textDim, fontSize: 12, margin: "4px 0 0", letterSpacing: 0.5 }}>
            Configuration &amp; Calibration
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "8px 24px", borderRadius: 4, fontSize: 11, fontWeight: 700,
            letterSpacing: 1, cursor: "pointer",
            background: saved ? COLORS.green : COLORS.gold,
            color: COLORS.bg, border: "none",
            transition: "background 0.2s",
          }}
        >
          {saving ? "SAVING..." : saved ? "SAVED" : "SAVE"}
        </button>
      </div>

      {/* System Info */}
      {health && (
        <div style={{ ...CARD, borderLeft: `3px solid ${COLORS.green}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: COLORS.green, marginBottom: 10 }}>
            SYSTEM STATUS
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[
              { label: "Backend", value: health.status || "OK", color: COLORS.green },
              { label: "sovereign-lib", value: health.sovereign_lib ? "Loaded" : "Missing", color: health.sovereign_lib ? COLORS.green : COLORS.red },
              { label: "Sessions", value: health.swings ?? "—", color: COLORS.text },
            ].map(item => (
              <div key={item.label} style={{ padding: "6px 10px", background: COLORS.bg, borderRadius: 4, border: `1px solid ${COLORS.border}` }}>
                <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1 }}>{item.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sensor Settings */}
      <div style={{ ...CARD, borderLeft: `3px solid ${COLORS.blue}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: COLORS.blue, marginBottom: 10 }}>
          SENSOR CONFIGURATION
        </div>
        <SettingRow label="Wake Threshold" description="Acceleration threshold to trigger capture (mg)">
          <input type="number" style={INPUT} value={sensor.threshold_mg || ""} onChange={e => update("sensor", "threshold_mg", Number(e.target.value))} />
        </SettingRow>
        <SettingRow label="Capture Duration" description="Seconds to capture after trigger">
          <input type="number" style={INPUT} value={sensor.capture_duration_s || ""} onChange={e => update("sensor", "capture_duration_s", Number(e.target.value))} />
        </SettingRow>
        <SettingRow label="Cooldown" description="Seconds between captures">
          <input type="number" style={INPUT} value={sensor.cooldown_s || ""} onChange={e => update("sensor", "cooldown_s", Number(e.target.value))} />
        </SettingRow>
        <SettingRow label="Sample Rate" description="ISM330DHCX sample rate (Hz)">
          <input type="number" style={INPUT} value={sensor.sample_rate_hz || ""} onChange={e => update("sensor", "sample_rate_hz", Number(e.target.value))} />
        </SettingRow>
        <SettingRow label="Auto-Analyze" description="Automatically analyze after capture">
          <Toggle value={sensor.auto_analyze ?? true} onChange={v => update("sensor", "auto_analyze", v)} />
        </SettingRow>
      </div>

      {/* Analysis Settings */}
      <div style={{ ...CARD, borderLeft: `3px solid ${COLORS.purple}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: COLORS.purple, marginBottom: 10 }}>
          ANALYSIS PIPELINE
        </div>
        <SettingRow label="Quality Threshold" description="Minimum quality score to accept session">
          <input type="number" step="0.1" style={INPUT} value={analysis.quality_threshold || ""} onChange={e => update("analysis", "quality_threshold", Number(e.target.value))} />
        </SettingRow>
        <SettingRow label="Min Samples" description="Minimum samples required for analysis">
          <input type="number" style={INPUT} value={analysis.min_samples || ""} onChange={e => update("analysis", "min_samples", Number(e.target.value))} />
        </SettingRow>
        <SettingRow label="Phase Detection" description="Run 8-phase motion detection">
          <Toggle value={analysis.phase_detection ?? true} onChange={v => update("analysis", "phase_detection", v)} />
        </SettingRow>
        <SettingRow label="Topology Encoding" description="Compute persistent homology and embeddings">
          <Toggle value={analysis.topology_encoding ?? true} onChange={v => update("analysis", "topology_encoding", v)} />
        </SettingRow>
        <SettingRow label="Auto-Classify" description="Run classification after analysis">
          <Toggle value={analysis.auto_classify ?? true} onChange={v => update("analysis", "auto_classify", v)} />
        </SettingRow>
      </div>

      {/* Display Settings */}
      <div style={{ ...CARD, borderLeft: `3px solid ${COLORS.gold}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: COLORS.gold, marginBottom: 10 }}>
          DISPLAY
        </div>
        <SettingRow label="Chart Height" description="Default chart height in pixels">
          <input type="number" style={INPUT} value={display.chart_height || ""} onChange={e => update("display", "chart_height", Number(e.target.value))} />
        </SettingRow>
        <SettingRow label="Downsample Factor" description="Reduce data points for chart rendering">
          <input type="number" style={INPUT} value={display.downsample_factor || ""} onChange={e => update("display", "downsample_factor", Number(e.target.value))} />
        </SettingRow>
        <SettingRow label="Phase Overlay" description="Show phase regions on waveform charts">
          <Toggle value={display.show_phase_overlay ?? true} onChange={v => update("display", "show_phase_overlay", v)} />
        </SettingRow>
      </div>

      {/* Export Settings */}
      <div style={{ ...CARD, borderLeft: `3px solid ${COLORS.textDim}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: COLORS.textDim, marginBottom: 10 }}>
          EXPORT
        </div>
        <SettingRow label="Include Raw Features" description="Export all 91 feature columns in CSV">
          <Toggle value={exp.include_raw_features ?? true} onChange={v => update("export", "include_raw_features", v)} />
        </SettingRow>
        <SettingRow label="Include Topology" description="Export Betti numbers and persistence in CSV">
          <Toggle value={exp.include_topology ?? true} onChange={v => update("export", "include_topology", v)} />
        </SettingRow>
      </div>

      {/* Webhooks */}
      <div style={{ ...CARD, borderLeft: `3px solid ${COLORS.green}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: COLORS.green, marginBottom: 10 }}>
          WEBHOOKS
        </div>
        <p style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 10 }}>
          Receive HTTP POST notifications when sessions are analyzed.
        </p>
        {webhooks.map(wh => (
          <div key={wh.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${COLORS.border}22` }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: wh.active ? COLORS.green : COLORS.textMuted }} />
            <span style={{ fontSize: 11, color: COLORS.text, fontFamily: "monospace", flex: 1 }}>{wh.url}</span>
            <span style={{ fontSize: 9, color: COLORS.textDim }}>{(wh.events || []).join(", ")}</span>
            <button
              onClick={async () => {
                await fetch(`/api/webhooks/${wh.id}`, { method: "DELETE" });
                setWebhooks(prev => prev.filter(h => h.id !== wh.id));
                addToast("Webhook removed", "info");
              }}
              style={{
                padding: "3px 8px", borderRadius: 3, fontSize: 9, cursor: "pointer",
                background: "transparent", border: `1px solid ${COLORS.red}30`, color: COLORS.red,
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            type="text"
            placeholder="https://example.com/webhook"
            value={newWebhookUrl}
            onChange={e => setNewWebhookUrl(e.target.value)}
            style={{ ...INPUT, flex: 1, width: "auto" }}
          />
          <button
            onClick={async () => {
              if (!newWebhookUrl.startsWith("http")) return;
              const resp = await fetch("/api/webhooks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: newWebhookUrl }),
              });
              const data = await resp.json();
              if (data.webhook) {
                setWebhooks(prev => [...prev, data.webhook]);
                setNewWebhookUrl("");
                addToast("Webhook added", "success");
              }
            }}
            style={{
              padding: "6px 14px", borderRadius: 4, fontSize: 10, fontWeight: 700,
              cursor: "pointer", background: `${COLORS.green}15`,
              border: `1px solid ${COLORS.green}40`, color: COLORS.green,
            }}
          >
            Add
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{ ...CARD, borderLeft: `3px solid ${COLORS.red}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: COLORS.red, marginBottom: 10 }}>
          DANGER ZONE
        </div>
        <SettingRow label="Clear All Sessions" description="Delete all session data. This cannot be undone.">
          <button
            onClick={async () => {
              if (!confirm("Delete ALL sessions? This cannot be undone.")) return;
              if (!confirm("Are you absolutely sure?")) return;
              try {
                const resp = await fetch("/api/swings");
                const swings = await resp.json();
                for (const s of swings) {
                  await fetch(`/api/swing/${s.id}`, { method: "DELETE" });
                }
                alert(`Deleted ${swings.length} sessions.`);
              } catch (e) {
                alert("Failed to clear sessions: " + e.message);
              }
            }}
            style={{
              padding: "6px 16px", borderRadius: 4, fontSize: 10, fontWeight: 700,
              cursor: "pointer", background: `${COLORS.red}15`,
              border: `1px solid ${COLORS.red}40`, color: COLORS.red,
            }}
          >
            CLEAR ALL
          </button>
        </SettingRow>
        <SettingRow label="Reset Settings" description="Restore all settings to defaults.">
          <button
            onClick={async () => {
              if (!confirm("Reset all settings to defaults?")) return;
              try {
                const resp = await fetch("/api/settings", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                const data = await resp.json();
                setSettings(data.settings);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              } catch (e) {
                console.error("Reset failed:", e);
              }
            }}
            style={{
              padding: "6px 16px", borderRadius: 4, fontSize: 10, fontWeight: 700,
              cursor: "pointer", background: `${COLORS.red}15`,
              border: `1px solid ${COLORS.red}40`, color: COLORS.red,
            }}
          >
            RESET
          </button>
        </SettingRow>
      </div>
    </div>
  );
}
