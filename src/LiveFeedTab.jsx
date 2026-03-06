import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchSwings, fetchSwing, ingestSwing, analyzeSwing, coachSwing, getHealth } from './DataService.jsx';
import { COLORS, CLASS_COLORS } from './theme.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceArea, ReferenceLine } from 'recharts';
import { useToast } from './Toasts.jsx';

const PHASE_COLORS_CHART = {
  idle: '#555555', onset: '#339af0', load: '#845ef7',
  peak_load: '#f59f00', drive: '#e67700', impact: '#e03131',
  follow: '#37b24d', recovery: '#868e96',
};

function IMUChart({ swingId, phases }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('accel'); // 'accel', 'gyro', 'impact'
  const [showPhases, setShowPhases] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(null);
  const playRef = useRef(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const resp = await fetch(`/api/swing/${swingId}/data?downsample=2`);
        const json = await resp.json();
        if (active) setData(json);
      } catch (e) {
        console.error('Failed to load swing data:', e);
      }
      if (active) setLoading(false);
    };
    load();
    return () => { active = false; };
  }, [swingId]);

  if (loading) return <div style={{ color: COLORS.textDim, fontSize: 11, padding: 12 }}>Loading waveform...</div>;
  if (!data || !data.imu || data.imu.length === 0) return <div style={{ color: COLORS.textMuted, fontSize: 11, padding: 12 }}>No IMU data available</div>;

  const downsample = 2; // matches the API downsample param
  const imu = data.imu.map((s, i) => ({ ...s, idx: i }));
  const impact = (data.impact || []).map((s, i) => ({ ...s, idx: i }));

  // Map phase sample indices to downsampled chart indices
  const phaseRegions = (phases || []).map(([start, end, name]) => ({
    x1: Math.floor(start / downsample),
    x2: Math.floor(end / downsample),
    name,
    color: PHASE_COLORS_CHART[name] || '#666',
  }));

  const tabStyle = (active) => ({
    padding: '4px 12px', borderRadius: 4, fontSize: 9, fontWeight: 700,
    letterSpacing: 1, cursor: 'pointer', border: '1px solid',
    background: active ? `${COLORS.gold}20` : 'transparent',
    borderColor: active ? COLORS.gold : COLORS.border,
    color: active ? COLORS.gold : COLORS.textMuted,
  });

  const tooltipStyle = {
    contentStyle: { background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 11 },
    labelStyle: { color: COLORS.textMuted },
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={() => setView('accel')} style={tabStyle(view === 'accel')}>ACCEL</button>
        <button onClick={() => setView('gyro')} style={tabStyle(view === 'gyro')}>GYRO</button>
        {impact.length > 0 && <button onClick={() => setView('impact')} style={tabStyle(view === 'impact')}>IMPACT ({impact.length})</button>}
        {phaseRegions.length > 0 && (
          <button onClick={() => setShowPhases(!showPhases)} style={tabStyle(showPhases)}>PHASES</button>
        )}
        <button
          onClick={() => {
            if (playing) {
              clearInterval(playRef.current);
              setPlaying(false);
              setCursor(null);
            } else {
              setCursor(0);
              setPlaying(true);
              const maxIdx = imu.length - 1;
              const speed = Math.max(1, Math.floor(maxIdx / 200)); // ~4s playback
              playRef.current = setInterval(() => {
                setCursor(prev => {
                  if (prev >= maxIdx) {
                    clearInterval(playRef.current);
                    setPlaying(false);
                    return null;
                  }
                  return prev + speed;
                });
              }, 20);
            }
          }}
          style={tabStyle(playing)}
        >
          {playing ? 'STOP' : 'REPLAY'}
        </button>
        <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 'auto', alignSelf: 'center' }}>
          {data.imu_count} samples{data.impact_count > 0 ? ` + ${data.impact_count} impact` : ''}
          {cursor != null && ` — ${cursor}/${imu.length}`}
        </span>
      </div>

      <div style={{ background: COLORS.bg, borderRadius: 6, padding: '8px 4px', border: `1px solid ${COLORS.border}` }}>
        {view === 'accel' && (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={imu} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="idx" tick={{ fontSize: 9, fill: COLORS.textMuted }} />
              <YAxis tick={{ fontSize: 9, fill: COLORS.textMuted }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {showPhases && phaseRegions.map((p, i) => (
                <ReferenceArea key={i} x1={p.x1} x2={p.x2} fill={p.color} fillOpacity={0.08} label={{
                  value: p.name.replace('_', ' '), position: 'insideTop', fontSize: 8,
                  fill: p.color, fontWeight: 700,
                }} />
              ))}
              <Line type="monotone" dataKey="accel_x_mg" stroke={COLORS.red} dot={false} strokeWidth={1} name="X" />
              <Line type="monotone" dataKey="accel_y_mg" stroke={COLORS.green} dot={false} strokeWidth={1} name="Y" />
              <Line type="monotone" dataKey="accel_z_mg" stroke={COLORS.blue} dot={false} strokeWidth={1} name="Z" />
              {cursor != null && <ReferenceLine x={cursor} stroke={COLORS.gold} strokeWidth={2} strokeDasharray="3 2" />}
            </LineChart>
          </ResponsiveContainer>
        )}
        {view === 'gyro' && (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={imu} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="idx" tick={{ fontSize: 9, fill: COLORS.textMuted }} />
              <YAxis tick={{ fontSize: 9, fill: COLORS.textMuted }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {showPhases && phaseRegions.map((p, i) => (
                <ReferenceArea key={i} x1={p.x1} x2={p.x2} fill={p.color} fillOpacity={0.08} label={{
                  value: p.name.replace('_', ' '), position: 'insideTop', fontSize: 8,
                  fill: p.color, fontWeight: 700,
                }} />
              ))}
              <Line type="monotone" dataKey="gyro_x_mdps" stroke="#ff6b6b" dot={false} strokeWidth={1} name="Gx" />
              <Line type="monotone" dataKey="gyro_y_mdps" stroke="#51cf66" dot={false} strokeWidth={1} name="Gy" />
              <Line type="monotone" dataKey="gyro_z_mdps" stroke="#339af0" dot={false} strokeWidth={1} name="Gz" />
              {cursor != null && <ReferenceLine x={cursor} stroke={COLORS.gold} strokeWidth={2} strokeDasharray="3 2" />}
            </LineChart>
          </ResponsiveContainer>
        )}
        {view === 'impact' && impact.length > 0 && (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={impact} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
              <XAxis dataKey="impact_idx" tick={{ fontSize: 9, fill: COLORS.textMuted }} />
              <YAxis tick={{ fontSize: 9, fill: COLORS.textMuted }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="impact_x_mg" stroke={COLORS.red} dot={false} strokeWidth={1} name="X" />
              <Line type="monotone" dataKey="impact_y_mg" stroke={COLORS.green} dot={false} strokeWidth={1} name="Y" />
              <Line type="monotone" dataKey="impact_z_mg" stroke={COLORS.blue} dot={false} strokeWidth={1} name="Z" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const REFRESH_INTERVAL = 30000; // 30 seconds

const STATUS_COLORS = {
  ingested: COLORS.blue,
  featured: COLORS.orange,
  encoded: COLORS.purple,
  classified: COLORS.green,
  coached: COLORS.gold,
};

export default function SessionFeedTab() {
  const [swings, setSwings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState(null);
  const [backendOnline, setBackendOnline] = useState(null);
  const [classFilter, setClassFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('newest'); // 'newest', 'oldest', 'name', 'status'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSwing, setExpandedSwing] = useState(null);
  const [expandedData, setExpandedData] = useState({});
  const [actionLoading, setActionLoading] = useState({});
  const fileInputRef = useRef(null);
  const mountedRef = useRef(true);
  const [dragOver, setDragOver] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const checkHealth = useCallback(async () => {
    const health = await getHealth();
    if (mountedRef.current) setBackendOnline(health.ok);
  }, []);

  const loadSwings = useCallback(async () => {
    const data = await fetchSwings();
    if (!mountedRef.current) return;
    if (data && data.error) {
      setBackendError(data.message);
      setBackendOnline(false);
    } else {
      setBackendError(null);
      setBackendOnline(true);
      setSwings(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, []);

  // Initial fetch + auto-refresh every 30s
  useEffect(() => {
    checkHealth();
    loadSwings();
    const timer = setInterval(loadSwings, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [loadSwings, checkHealth]);

  const [uploadProgress, setUploadProgress] = useState(null); // { done, total }

  const handleFiles = useCallback(async (files) => {
    const total = files.length;
    setUploadProgress({ done: 0, total });
    for (let i = 0; i < files.length; i++) {
      await ingestSwing(files[i]);
      if (mountedRef.current) setUploadProgress({ done: i + 1, total });
    }
    setUploadProgress(null);
    addToast(`Uploaded ${total} session${total > 1 ? 's' : ''}`, 'success');
    const updated = await fetchSwings();
    if (mountedRef.current) setSwings(Array.isArray(updated) ? updated : []);
  }, [addToast]);

  const handleAnalyze = useCallback(async (id) => {
    setActionLoading(prev => ({ ...prev, [id]: 'analyzing' }));
    try {
      await analyzeSwing(id);
      addToast(`Analysis complete: ${id.slice(0, 8)}`, 'success');
      const updated = await fetchSwings();
      if (mountedRef.current) setSwings(Array.isArray(updated) ? updated : []);
    } catch (e) {
      addToast(`Analysis failed: ${e.message}`, 'error');
      console.error('Analyze failed:', e);
    }
    if (mountedRef.current) setActionLoading(prev => ({ ...prev, [id]: null }));
  }, [addToast]);

  const handleCoach = useCallback(async (id) => {
    setActionLoading(prev => ({ ...prev, [id]: 'coaching' }));
    try {
      await coachSwing(id);
      const updated = await fetchSwings();
      if (mountedRef.current) setSwings(Array.isArray(updated) ? updated : []);
    } catch (e) {
      console.error('Coach failed:', e);
    }
    if (mountedRef.current) setActionLoading(prev => ({ ...prev, [id]: null }));
  }, []);

  // Stats
  const classifiedSwings = swings.filter(s => s.classification != null);
  const avgConfidence = classifiedSwings.length > 0
    ? Math.round(classifiedSwings.reduce((sum, s) => sum + (s.classification_confidence || 0), 0) / classifiedSwings.length)
    : 0;

  const [tagFilter, setTagFilter] = useState(null);
  const [groupFilter, setGroupFilter] = useState(null);

  // Collect all unique tags and groups
  const allTags = [...new Set(swings.flatMap(s => s.tags || []))];
  const allGroups = [...new Set(swings.map(s => s.group).filter(Boolean))];

  // Filtered, searched, and sorted swings
  let filtered = classFilter === 'ALL'
    ? swings
    : swings.filter(s => s.classification === classFilter);
  if (tagFilter) {
    filtered = filtered.filter(s => (s.tags || []).includes(tagFilter));
  }
  if (groupFilter) {
    filtered = filtered.filter(s => s.group === groupFilter);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(s =>
      (s.filename || '').toLowerCase().includes(q) ||
      (s.id || '').toLowerCase().includes(q) ||
      (s.notes || '').toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  // Sort
  filtered = [...filtered];
  if (sortBy === 'oldest') filtered.reverse();
  else if (sortBy === 'name') filtered.sort((a, b) => (a.filename || '').localeCompare(b.filename || ''));
  else if (sortBy === 'status') filtered.sort((a, b) => (a.status || '').localeCompare(b.status || ''));

  return (
    <div style={{ padding: '32px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: 22,
          color: COLORS.gold, margin: '0 0 6px',
        }}>
          Session Feed
        </h2>
        <p style={{ fontSize: 13, color: COLORS.textDim, margin: 0, lineHeight: 1.5, maxWidth: 700 }}>
          Session-by-session motion log. Upload CSV files for ingestion, then analyze and coach each session.
          Auto-refreshes every 30 seconds.
        </p>
      </div>

      {/* Connection Status */}
      {backendOnline !== null && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', marginBottom: 16, borderRadius: 6,
          background: backendOnline ? `${COLORS.green}10` : `${COLORS.red}10`,
          border: `1px solid ${backendOnline ? COLORS.green + '30' : COLORS.red + '30'}`,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: backendOnline ? COLORS.green : COLORS.red,
          }} />
          <span style={{ fontSize: 11, color: backendOnline ? COLORS.green : COLORS.red, fontWeight: 600 }}>
            {backendOnline ? 'Backend online' : 'Backend offline'}
          </span>
          {backendError && (
            <span style={{ fontSize: 11, color: COLORS.textMuted, marginLeft: 8 }}>
              {backendError}
            </span>
          )}
        </div>
      )}

      {/* Error state with retry */}
      {backendError && !loading && (
        <div style={{
          textAlign: 'center', padding: 40, marginBottom: 20,
          background: `${COLORS.red}08`, border: `1px solid ${COLORS.red}25`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 14, color: COLORS.red, marginBottom: 8, fontWeight: 600 }}>
            Backend offline
          </div>
          <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 16 }}>
            {backendError}
          </div>
          <button
            onClick={() => { setLoading(true); setBackendError(null); loadSwings(); }}
            style={{
              padding: '8px 24px', borderRadius: 6, fontSize: 11, fontWeight: 700,
              letterSpacing: 1, cursor: 'pointer',
              background: `${COLORS.gold}15`, border: `1px solid ${COLORS.gold}40`, color: COLORS.gold,
            }}
          >
            RETRY
          </button>
        </div>
      )}

      {/* Upload Area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files);
          const csvFiles = files.filter(f => f.name.toLowerCase().endsWith('.csv'));
          const rejected = files.length - csvFiles.length;
          if (rejected > 0) addToast(`${rejected} non-CSV file${rejected > 1 ? 's' : ''} skipped`, 'warning');
          if (csvFiles.length > 0) handleFiles(csvFiles);
        }}
        style={{
          border: `2px dashed ${dragOver ? COLORS.gold : COLORS.border}`,
          borderRadius: 12,
          padding: '32px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 24,
          background: dragOver ? `${COLORS.gold}10` : `${COLORS.surface}80`,
          transition: 'all 0.2s',
        }}
      >
        <div style={{ fontSize: 14, color: COLORS.textDim, marginBottom: 6 }}>
          Drop CSV files here or click to upload
        </div>
        <div style={{ fontSize: 11, color: COLORS.textMuted }}>
          {uploadProgress
            ? `Uploading ${uploadProgress.done}/${uploadProgress.total}...`
            : 'Files will be ingested and auto-analyzed'}
        </div>
        {uploadProgress && (
          <div style={{ width: 200, height: 4, background: COLORS.border, borderRadius: 2, margin: '8px auto 0', overflow: 'hidden' }}>
            <div style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%`, height: '100%', background: COLORS.green, borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files.length > 0) handleFiles(Array.from(e.target.files));
            e.target.value = '';
          }}
        />
      </div>

      {/* Export bar */}
      {swings.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 16, padding: '8px 14px',
          background: `${COLORS.blue}08`, border: `1px solid ${COLORS.blue}20`, borderRadius: 8,
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1, marginRight: 4 }}>EXPORT</span>
          <button
            onClick={() => { window.open('/api/export/csv', '_blank'); }}
            style={{
              padding: '5px 14px', borderRadius: 5, fontSize: 10, fontWeight: 600,
              cursor: 'pointer', background: `${COLORS.blue}15`,
              border: `1px solid ${COLORS.blue}40`, color: COLORS.blue,
            }}
          >
            All Sessions CSV
          </button>
          <span style={{ fontSize: 9, color: COLORS.textMuted, marginLeft: 'auto' }}>
            {swings.length} session{swings.length !== 1 ? 's' : ''} + {Object.keys(swings[0]?.features || {}).length || '91'} features
          </span>
        </div>
      )}

      {/* Session Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'TOTAL SWINGS', value: swings.length, color: COLORS.gold },
          { label: 'CLASSIFIED', value: classifiedSwings.length, color: COLORS.green },
          { label: 'AVG CONFIDENCE', value: `${avgConfidence}%`, color: COLORS.blue },
        ].map((stat, i) => (
          <div key={i} style={{
            padding: '14px 16px', borderRadius: 8, textAlign: 'center',
            background: `${stat.color}08`, border: `1px solid ${stat.color}20`,
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1, marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Controls */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 20, padding: '12px 16px',
        background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10,
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1, marginRight: 8 }}>FILTER</span>
        {['ALL', 'CLEAN', 'NOISY', 'MIXED'].map(f => (
          <button key={f} onClick={() => setClassFilter(f)} style={{
            padding: '5px 14px', borderRadius: 5, fontSize: 10, fontWeight: 600,
            cursor: 'pointer', border: '1px solid', letterSpacing: 0.5,
            background: classFilter === f
              ? (f === 'ALL' ? `${COLORS.gold}20` : `${CLASS_COLORS[f] || COLORS.gold}25`)
              : 'transparent',
            borderColor: classFilter === f
              ? (f === 'ALL' ? COLORS.gold : CLASS_COLORS[f] || COLORS.gold)
              : COLORS.border,
            color: classFilter === f
              ? (f === 'ALL' ? COLORS.gold : CLASS_COLORS[f] || COLORS.gold)
              : COLORS.textMuted,
          }}>
            {f}
          </button>
        ))}
        {allTags.length > 0 && (
          <>
            <span style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1, marginLeft: 8, marginRight: 4 }}>TAG</span>
            {allTags.map(tag => (
              <button key={tag} onClick={() => setTagFilter(tagFilter === tag ? null : tag)} style={{
                padding: '4px 10px', borderRadius: 10, fontSize: 9, fontWeight: 600,
                cursor: 'pointer', border: '1px solid',
                background: tagFilter === tag ? `${COLORS.blue}20` : 'transparent',
                borderColor: tagFilter === tag ? COLORS.blue : COLORS.border,
                color: tagFilter === tag ? COLORS.blue : COLORS.textMuted,
              }}>
                {tag}
              </button>
            ))}
          </>
        )}
        {allGroups.length > 0 && (
          <>
            <span style={{ fontSize: 10, color: COLORS.textMuted, letterSpacing: 1, marginLeft: 8, marginRight: 4 }}>GROUP</span>
            {allGroups.map(g => (
              <button key={g} onClick={() => setGroupFilter(groupFilter === g ? null : g)} style={{
                padding: '4px 10px', borderRadius: 10, fontSize: 9, fontWeight: 600,
                cursor: 'pointer', border: '1px solid',
                background: groupFilter === g ? `${COLORS.purple}20` : 'transparent',
                borderColor: groupFilter === g ? COLORS.purple : COLORS.border,
                color: groupFilter === g ? COLORS.purple : COLORS.textMuted,
              }}>
                {g}
              </button>
            ))}
          </>
        )}
        {swings.some(s => s.status === 'ingested') && (
          <button onClick={async () => {
            const unanalyzed = swings.filter(s => s.status === 'ingested');
            for (const s of unanalyzed) {
              setActionLoading(prev => ({ ...prev, [s.id]: 'analyzing' }));
              try { await analyzeSwing(s.id); } catch (e) { console.error(e); }
              if (mountedRef.current) setActionLoading(prev => ({ ...prev, [s.id]: null }));
            }
            const updated = await fetchSwings();
            if (mountedRef.current) setSwings(Array.isArray(updated) ? updated : []);
          }} style={{
            marginLeft: 'auto', padding: '6px 14px', borderRadius: 5, fontSize: 10,
            fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
            background: `${COLORS.green}15`, border: `1px solid ${COLORS.green}40`, color: COLORS.green,
          }}>
            ANALYZE ALL ({swings.filter(s => s.status === 'ingested').length})
          </button>
        )}
        <button onClick={loadSwings} style={{
          marginLeft: swings.some(s => s.status === 'ingested') ? 0 : 'auto',
          padding: '6px 14px', borderRadius: 5, fontSize: 10,
          fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
          background: `${COLORS.gold}15`, border: `1px solid ${COLORS.gold}40`, color: COLORS.gold,
        }}>
          REFRESH
        </button>
      </div>

      {/* Search + Sort */}
      {swings.length > 3 && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center',
        }}>
          <input
            type="text"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              flex: 1, maxWidth: 300, padding: '6px 12px', fontSize: 11,
              background: COLORS.surface, border: `1px solid ${COLORS.border}`,
              borderRadius: 6, color: COLORS.text, outline: 'none',
            }}
          />
          <span style={{ fontSize: 9, color: COLORS.textMuted, letterSpacing: 1 }}>SORT</span>
          {['newest', 'oldest', 'name', 'status'].map(s => (
            <button key={s} onClick={() => setSortBy(s)} style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 9, fontWeight: 600,
              cursor: 'pointer', border: '1px solid',
              background: sortBy === s ? `${COLORS.gold}15` : 'transparent',
              borderColor: sortBy === s ? COLORS.gold : COLORS.border,
              color: sortBy === s ? COLORS.gold : COLORS.textMuted,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {s}
            </button>
          ))}
          {(searchQuery || tagFilter || classFilter !== 'ALL') && (
            <span style={{ fontSize: 10, color: COLORS.textDim }}>
              {filtered.length}/{swings.length} shown
            </span>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && swings.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: COLORS.textDim }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>Loading swing session data...</div>
          <div style={{
            width: 200, height: 4, borderRadius: 2,
            background: COLORS.border, margin: '0 auto', overflow: 'hidden',
          }}>
            <div style={{
              width: '60%', height: '100%', background: COLORS.gold,
              borderRadius: 2, animation: 'pulse 1.5s infinite',
            }} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && swings.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 40,
          background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12,
        }}>
          <div style={{ fontSize: 14, color: COLORS.textDim, marginBottom: 8 }}>
            No swings ingested yet. Upload CSV files above to get started.
          </div>
        </div>
      )}

      {/* Swing Cards */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((swing) => {
            const id = swing.id || swing.swing_id;
            const isExpanded = expandedSwing === id;
            const classColor = CLASS_COLORS[swing.classification] || COLORS.textMuted;
            const statusColor = STATUS_COLORS[swing.status] || COLORS.textMuted;
            const isAnalyzing = actionLoading[id] === 'analyzing';
            const isCoaching = actionLoading[id] === 'coaching';

            return (
              <div
                key={id}
                onClick={() => {
                  if (isExpanded) {
                    setExpandedSwing(null);
                  } else {
                    setExpandedSwing(id);
                    if (!expandedData[id]) {
                      Promise.all([
                        fetchSwing(id),
                        fetch(`/api/swing/${id}/quality`).then(r => r.json()).catch(() => null),
                      ]).then(([data, quality]) => {
                        if (mountedRef.current) {
                          const merged = { ...data, _quality: quality };
                          setExpandedData(prev => ({ ...prev, [id]: merged }));
                        }
                      });
                    }
                  }
                }}
                style={{
                  background: isExpanded ? `${classColor}08` : COLORS.surface,
                  border: `1px solid ${isExpanded ? classColor + '40' : COLORS.border}`,
                  borderRadius: 10,
                  padding: '16px 20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                      color: COLORS.text,
                    }}>
                      {id}
                    </span>
                    {swing.filename && (
                      <span style={{ fontSize: 11, color: COLORS.textDim }}>
                        {swing.filename}
                      </span>
                    )}
                    {swing.status && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                        padding: '2px 8px', borderRadius: 10,
                        background: `${statusColor}20`, color: statusColor,
                      }}>
                        {swing.status.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {(swing.tags || []).slice(0, 3).map((tag, ti) => (
                      <span key={ti} style={{
                        fontSize: 8, padding: '1px 6px', borderRadius: 8,
                        background: `${COLORS.blue}12`, color: COLORS.blue,
                        border: `1px solid ${COLORS.blue}20`,
                      }}>
                        {tag}
                      </span>
                    ))}
                    {(swing.tags || []).length > 3 && (
                      <span style={{ fontSize: 8, color: COLORS.textMuted }}>+{swing.tags.length - 3}</span>
                    )}
                    {/* Classification badge */}
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 1,
                      padding: '3px 10px', borderRadius: 4,
                      background: swing.classification ? `${classColor}20` : 'transparent',
                      color: swing.classification ? classColor : COLORS.textMuted,
                      border: swing.classification ? 'none' : `1px solid ${COLORS.border}`,
                    }}>
                      {swing.classification || '\u2014'}
                    </span>
                  </div>
                </div>

                {/* Ground truth row */}
                {swing.ground_truth && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    {swing.ground_truth.ball_speed != null && (
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: `${COLORS.blue}12`, color: COLORS.blue,
                        border: `1px solid ${COLORS.blue}20`,
                      }}>
                        Ball: {swing.ground_truth.ball_speed} mph
                      </span>
                    )}
                    {swing.ground_truth.launch_angle != null && (
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: `${COLORS.orange}12`, color: COLORS.orange,
                        border: `1px solid ${COLORS.orange}20`,
                      }}>
                        Launch: {swing.ground_truth.launch_angle}°
                      </span>
                    )}
                    {swing.ground_truth.spin_rate != null && (
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: `${COLORS.purple}12`, color: COLORS.purple,
                        border: `1px solid ${COLORS.purple}20`,
                      }}>
                        Spin: {swing.ground_truth.spin_rate} rpm
                      </span>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    disabled={!!swing.classification || isAnalyzing}
                    onClick={() => handleAnalyze(id)}
                    style={{
                      padding: '5px 14px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                      cursor: swing.classification || isAnalyzing ? 'not-allowed' : 'pointer',
                      background: swing.classification
                        ? `${COLORS.textMuted}10`
                        : `${COLORS.green}15`,
                      border: `1px solid ${swing.classification ? COLORS.textMuted + '30' : COLORS.green + '40'}`,
                      color: swing.classification ? COLORS.textMuted : COLORS.green,
                      opacity: swing.classification ? 0.5 : 1,
                    }}
                  >
                    {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                  </button>
                  <button
                    disabled={isCoaching}
                    onClick={() => handleCoach(id)}
                    style={{
                      padding: '5px 14px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                      cursor: isCoaching ? 'not-allowed' : 'pointer',
                      background: `${COLORS.gold}15`,
                      border: `1px solid ${COLORS.gold}40`,
                      color: COLORS.gold,
                    }}
                  >
                    {isCoaching ? 'Coaching...' : 'Coach'}
                  </button>
                  <button
                    onClick={async () => {
                      const resp = await fetch(`/api/swing/${id}/report`);
                      const data = await resp.json();
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `report_${id}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    style={{
                      padding: '5px 14px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                      cursor: 'pointer', background: `${COLORS.blue}15`,
                      border: `1px solid ${COLORS.blue}40`, color: COLORS.blue,
                    }}
                  >
                    Export
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const resp = await fetch(`/api/swing/${id}/report`);
                        const report = await resp.json();
                        const w = window.open('', '_blank');
                        if (!w) return;
                        const feat = report.feature_summary || {};
                        const topo = report.topology_summary || {};
                        const phaseAnalysis = report.phase_analysis || {};
                        const cls = report.classification || {};
                        const phaseRows = (phaseAnalysis.phases || []).map(p =>
                          `<tr><td>${p.name}</td><td>${p.start}</td><td>${p.end}</td><td>${p.end - p.start}</td></tr>`
                        ).join('');
                        w.document.write(`<!DOCTYPE html><html><head><title>Session Report — ${report.filename}</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; color: #1a1a2e; line-height: 1.6; }
  h1 { color: #c9a84c; border-bottom: 2px solid #c9a84c; padding-bottom: 8px; }
  h2 { color: #333; margin-top: 24px; font-size: 16px; letter-spacing: 1px; text-transform: uppercase; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ddd; padding: 6px 12px; text-align: left; font-size: 13px; }
  th { background: #f5f5f5; font-weight: 600; }
  .metric { display: inline-block; padding: 8px 16px; margin: 4px; background: #f9f9f9; border-radius: 6px; border: 1px solid #eee; }
  .metric .label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .metric .value { font-size: 18px; font-weight: 700; color: #1a1a2e; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 12px; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #888; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>SOVEREIGN MOTION — Session Report</h1>
<p><strong>Session:</strong> ${report.filename} &nbsp; <strong>ID:</strong> ${report.id} &nbsp; <strong>Generated:</strong> ${new Date(report.generated_at).toLocaleString()}</p>

${cls.class ? `<p><span class="badge" style="background: #c9a84c22; color: #c9a84c;">${cls.class.toUpperCase()}</span> — ${((cls.confidence || 0) * 100).toFixed(0)}% confidence</p>` : ''}

<h2>Feature Summary</h2>
<div>
  <div class="metric"><div class="label">Features</div><div class="value">${feat.total_features || '—'}</div></div>
  <div class="metric"><div class="label">Duration</div><div class="value">${feat.duration_s?.toFixed(2) || '—'}s</div></div>
  <div class="metric"><div class="label">Sample Rate</div><div class="value">${feat.sample_rate_hz || '—'} Hz</div></div>
  <div class="metric"><div class="label">Peak Accel</div><div class="value">${feat.peak_acceleration_mg?.toFixed(0) || '—'} mg</div></div>
  <div class="metric"><div class="label">Smoothness</div><div class="value">${feat.motion_smoothness?.toFixed(3) || '—'}</div></div>
</div>

<h2>Topology</h2>
<div>
  <div class="metric"><div class="label">Betti-0</div><div class="value">${topo.betti_0 ?? '—'}</div></div>
  <div class="metric"><div class="label">Betti-1</div><div class="value">${topo.betti_1 ?? '—'}</div></div>
  <div class="metric"><div class="label">Total Persistence</div><div class="value">${topo.total_persistence?.toFixed(4) || '—'}</div></div>
  <div class="metric"><div class="label">Embedding</div><div class="value">${topo.embedding_dimension || '—'}D</div></div>
</div>

${phaseAnalysis.phases?.length ? `
<h2>Phase Analysis</h2>
<p>${phaseAnalysis.n_phases || '—'} phases detected &nbsp; Active duration: ${phaseAnalysis.active_duration_s?.toFixed(2) || '—'}s</p>
<table><thead><tr><th>Phase</th><th>Start</th><th>End</th><th>Duration</th></tr></thead><tbody>${phaseRows}</tbody></table>
` : ''}

${report.coaching_notes ? `<h2>Coaching Notes</h2><p>${report.coaching_notes}</p>` : ''}

<div class="footer">SOVEREIGN MOTION v1.0 — Topological Motion Intelligence<br>Report generated ${new Date().toLocaleString()}</div>
</body></html>`);
                        w.document.close();
                        w.print();
                      } catch (e) { console.error('Report error:', e); }
                    }}
                    style={{
                      padding: '5px 14px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                      cursor: 'pointer', background: `${COLORS.green}15`,
                      border: `1px solid ${COLORS.green}40`, color: COLORS.green,
                    }}
                  >
                    Print Report
                  </button>
                  <button
                    onClick={async () => {
                      const label = prompt('Baseline label:', `Baseline ${id}`);
                      if (!label) return;
                      await fetch(`/api/baselines/${id}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ label }),
                      });
                    }}
                    style={{
                      padding: '5px 14px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                      cursor: 'pointer', background: `${COLORS.purple}15`,
                      border: `1px solid ${COLORS.purple}40`, color: COLORS.purple,
                    }}
                  >
                    Save Baseline
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete session ${id}? This cannot be undone.`)) return;
                      await fetch(`/api/swing/${id}`, { method: 'DELETE' });
                      addToast('Session deleted', 'info');
                      const resp = await fetch('/api/swings');
                      const updated = await resp.json();
                      if (mountedRef.current) setSwings(Array.isArray(updated) ? updated : []);
                    }}
                    style={{
                      padding: '5px 14px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                      cursor: 'pointer', background: `${COLORS.red}10`,
                      border: `1px solid ${COLORS.red}30`, color: COLORS.red,
                      marginLeft: 'auto',
                    }}
                  >
                    Delete
                  </button>
                </div>

                {/* Expandable detail */}
                {isExpanded && (() => {
                  const full = expandedData[id] || {};
                  const feat = full.features || {};
                  const topo = full.topology || {};
                  const phases = topo.phases?.phases || [];
                  const phaseSummary = topo.phases?.summary || {};
                  const PHASE_COLORS = {
                    idle: COLORS.textMuted, onset: COLORS.blue, load: COLORS.purple,
                    peak_load: COLORS.gold, drive: COLORS.orange, impact: COLORS.red,
                    follow: COLORS.green, recovery: COLORS.textDim,
                  };

                  const quality = full._quality;

                  return (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
                    {/* Data Quality Badge */}
                    {quality && quality.quality && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                        padding: '6px 12px', borderRadius: 6,
                        background: quality.score > 0.8 ? `${COLORS.green}08` : quality.score > 0.5 ? `${'#e0c040'}08` : `${COLORS.red}08`,
                        border: `1px solid ${quality.score > 0.8 ? COLORS.green : quality.score > 0.5 ? '#e0c040' : COLORS.red}20`,
                      }}>
                        <span style={{
                          fontSize: 16, fontWeight: 800,
                          color: quality.score > 0.8 ? COLORS.green : quality.score > 0.5 ? '#e0c040' : COLORS.red,
                        }}>
                          {(quality.score * 100).toFixed(0)}%
                        </span>
                        <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                          {quality.quality}
                        </span>
                        {quality.issues && quality.issues.length > 0 && (
                          <span style={{ fontSize: 9, color: COLORS.red, marginLeft: 8 }}>
                            {quality.issues.length} issue{quality.issues.length > 1 ? 's' : ''}
                          </span>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                          {Object.entries(quality.scores || {}).map(([k, v]) => (
                            <span key={k} title={k} style={{
                              width: 6, height: 14, borderRadius: 2,
                              background: v > 0.8 ? COLORS.green : v > 0.5 ? '#e0c040' : COLORS.red,
                              opacity: 0.7,
                            }} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Session metadata */}
                    {full.session_meta && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        {Object.entries(full.session_meta).map(([k, v]) => (
                          <span key={k} style={{
                            fontSize: 9, padding: '2px 6px', borderRadius: 3,
                            background: `${COLORS.blue}10`, color: COLORS.blue,
                            border: `1px solid ${COLORS.blue}15`, fontFamily: 'monospace',
                          }}>
                            {k}={v}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      {/* Features highlight */}
                      <div>
                        <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                          FEATURES ({Object.keys(feat).length})
                        </div>
                        {Object.keys(feat).length > 0 ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                            {[
                              { label: 'Peak Accel', key: 'accel_mag_max', unit: 'mg' },
                              { label: 'Peak Gyro', key: 'gyro_mag_max', unit: 'mdps' },
                              { label: 'Duration', key: 'duration_s', unit: 's' },
                              { label: 'Sample Rate', key: 'sample_rate_hz', unit: 'Hz' },
                              { label: 'Smoothness', key: 'smoothness', unit: '' },
                              { label: 'Jerk Ratio', key: 'jerk_ratio', unit: '' },
                              { label: 'Accel RMS', key: 'accel_mag_rms', unit: 'mg' },
                              { label: 'Entropy', key: 'accel_entropy', unit: '' },
                            ].map(item => (
                              <div key={item.key} style={{ fontSize: 10, color: COLORS.textDim }}>
                                <span style={{ color: COLORS.textMuted }}>{item.label}: </span>
                                <strong style={{ color: COLORS.text }}>
                                  {feat[item.key] != null ? (typeof feat[item.key] === 'number' ? feat[item.key].toFixed(1) : feat[item.key]) : '—'}
                                </strong>
                                {item.unit && <span style={{ color: COLORS.textMuted, fontSize: 9 }}> {item.unit}</span>}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: COLORS.textDim }}>Not yet extracted</div>
                        )}
                      </div>

                      {/* Topology summary */}
                      <div>
                        <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                          TOPOLOGY
                        </div>
                        {topo.embedding ? (
                          <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                              <div style={{ fontSize: 10, color: COLORS.textDim }}>
                                Betti-0: <strong style={{ color: COLORS.text }}>{topo.betti_0}</strong>
                              </div>
                              <div style={{ fontSize: 10, color: COLORS.textDim }}>
                                Betti-1: <strong style={{ color: COLORS.text }}>{topo.betti_1}</strong>
                              </div>
                              <div style={{ fontSize: 10, color: COLORS.textDim }}>
                                Persistence: <strong style={{ color: COLORS.text }}>{topo.total_persistence?.toFixed(3)}</strong>
                              </div>
                              <div style={{ fontSize: 10, color: COLORS.textDim }}>
                                Embedding: <strong style={{ color: COLORS.text }}>{topo.embedding?.length}D</strong>
                              </div>
                            </div>
                            {topo.point_cloud_stats && (
                              <div style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 4 }}>
                                Point cloud: {topo.point_cloud_stats.n_points} pts in {topo.point_cloud_stats.dimension}D
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: COLORS.textDim }}>Not yet encoded</div>
                        )}
                      </div>
                    </div>

                    {/* Phase timeline */}
                    {phases.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                          PHASES ({phaseSummary.n_phases || phases.length})
                          {phaseSummary.active_duration_s && (
                            <span style={{ fontWeight: 400, marginLeft: 8 }}>
                              Active: {phaseSummary.active_duration_s.toFixed(2)}s
                            </span>
                          )}
                        </div>
                        <div style={{
                          display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden',
                          border: `1px solid ${COLORS.border}`,
                        }}>
                          {phases.map(([start, end, name], i) => {
                            const total = phases[phases.length - 1]?.[1] || 1;
                            const width = ((end - start) / total) * 100;
                            return (
                              <div key={i} title={`${name} [${start}-${end}]`} style={{
                                width: `${Math.max(width, 1)}%`,
                                background: `${PHASE_COLORS[name] || COLORS.textMuted}40`,
                                borderRight: i < phases.length - 1 ? `1px solid ${COLORS.bg}` : 'none',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {width > 8 && (
                                  <span style={{
                                    fontSize: 7, color: PHASE_COLORS[name] || COLORS.textMuted,
                                    fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                                  }}>
                                    {name}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Classification details */}
                    {swing.classification && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                          CLASSIFICATION
                        </div>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <span style={{ fontSize: 12, color: COLORS.textDim }}>
                            Class: <strong style={{ color: classColor }}>{swing.classification}</strong>
                          </span>
                          {swing.classification_confidence != null && (
                            <span style={{ fontSize: 12, color: COLORS.textDim }}>
                              Confidence: <strong style={{ color: COLORS.text }}>{swing.classification_confidence}%</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Coaching notes */}
                    {swing.coaching_notes && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 9, color: COLORS.gold, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                          COACHING NOTES
                        </div>
                        <div style={{
                          fontSize: 12, color: COLORS.textDim, lineHeight: 1.6,
                          padding: '8px 12px', borderRadius: 6,
                          background: `${COLORS.gold}08`, border: `1px solid ${COLORS.gold}15`,
                        }}>
                          {swing.coaching_notes}
                        </div>
                      </div>
                    )}

                    {/* Group */}
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1 }}>GROUP</span>
                      <select
                        value={full.group || swing.group || ''}
                        onChange={async (e) => {
                          const group = e.target.value || null;
                          await fetch(`/api/swing/${id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ group }),
                          });
                          addToast(group ? `Assigned to ${group}` : 'Removed from group', 'info');
                          loadSwings();
                        }}
                        style={{
                          background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                          borderRadius: 4, color: COLORS.text, padding: '4px 8px',
                          fontSize: 11, minWidth: 120,
                        }}
                      >
                        <option value="">No group</option>
                        {[...new Set(swings.map(s => s.group).filter(Boolean))].map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                      <button onClick={() => {
                        const name = prompt('New group name:');
                        if (!name) return;
                        fetch(`/api/swing/${id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ group: name.trim() }),
                        }).then(() => { addToast(`Created group: ${name}`, 'success'); loadSwings(); });
                      }} style={{
                        fontSize: 9, padding: '3px 8px', borderRadius: 3,
                        background: 'transparent', color: COLORS.textMuted,
                        border: `1px dashed ${COLORS.border}`, cursor: 'pointer',
                      }}>
                        + new
                      </button>
                    </div>

                    {/* Tags */}
                    <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                        TAGS
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        {(swing.tags || []).map((tag, ti) => (
                          <span key={ti} style={{
                            fontSize: 9, padding: '2px 8px', borderRadius: 10,
                            background: `${COLORS.blue}15`, color: COLORS.blue,
                            border: `1px solid ${COLORS.blue}25`,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                            {tag}
                            <span style={{ cursor: 'pointer', opacity: 0.6 }} onClick={async () => {
                              const newTags = (swing.tags || []).filter((_, i) => i !== ti);
                              await fetch(`/api/swing/${id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ tags: newTags }),
                              });
                              loadSwings();
                            }}>&times;</span>
                          </span>
                        ))}
                        <button onClick={() => {
                          const tag = prompt('Add tag:');
                          if (!tag) return;
                          const newTags = [...(swing.tags || []), tag.trim()];
                          fetch(`/api/swing/${id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tags: newTags }),
                          }).then(() => loadSwings());
                        }} style={{
                          fontSize: 9, padding: '2px 8px', borderRadius: 10,
                          background: 'transparent', color: COLORS.textMuted,
                          border: `1px dashed ${COLORS.border}`, cursor: 'pointer',
                        }}>
                          + tag
                        </button>
                      </div>
                    </div>

                    {/* Notes */}
                    <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
                      <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                        NOTES
                      </div>
                      <textarea
                        defaultValue={full.notes || swing.notes || ''}
                        placeholder="Add session notes..."
                        onBlur={async (e) => {
                          const val = e.target.value.trim();
                          if (val !== (full.notes || swing.notes || '')) {
                            await fetch(`/api/swing/${id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ notes: val || null }),
                            });
                          }
                        }}
                        style={{
                          width: '100%', minHeight: 60, resize: 'vertical',
                          fontSize: 11, lineHeight: 1.5, fontFamily: 'inherit',
                          padding: '8px 10px', borderRadius: 6,
                          background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                          color: COLORS.textDim, outline: 'none',
                        }}
                      />
                    </div>

                    {/* IMU Waveform Chart with Phase Overlay */}
                    <IMUChart swingId={id} phases={phases} />
                  </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* No results from filter */}
      {!loading && swings.length > 0 && filtered.length === 0 && (
        <div style={{
          textAlign: 'center', padding: 30,
          background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10,
          color: COLORS.textDim, fontSize: 13,
        }}>
          No swings match the "{classFilter}" filter.
        </div>
      )}
    </div>
  );
}
