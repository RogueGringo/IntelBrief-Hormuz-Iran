import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchSwings, ingestSwing, analyzeSwing, coachSwing, getHealth } from './DataService.jsx';
import { COLORS, CLASS_COLORS } from './theme.js';

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
  const [expandedSwing, setExpandedSwing] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const fileInputRef = useRef(null);
  const mountedRef = useRef(true);

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

  const handleFiles = useCallback(async (files) => {
    for (const file of files) {
      await ingestSwing(file);
    }
    const updated = await fetchSwings();
    if (mountedRef.current) setSwings(Array.isArray(updated) ? updated : []);
  }, []);

  const handleAnalyze = useCallback(async (id) => {
    setActionLoading(prev => ({ ...prev, [id]: 'analyzing' }));
    try {
      await analyzeSwing(id);
      const updated = await fetchSwings();
      if (mountedRef.current) setSwings(Array.isArray(updated) ? updated : []);
    } catch (e) {
      console.error('Analyze failed:', e);
    }
    if (mountedRef.current) setActionLoading(prev => ({ ...prev, [id]: null }));
  }, []);

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

  // Filtered swings
  const filtered = classFilter === 'ALL'
    ? swings
    : swings.filter(s => s.classification === classFilter);

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
          Swing-by-swing session log. Upload CSV files for ingestion, then analyze and coach each swing.
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
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer.files.length > 0) handleFiles(Array.from(e.dataTransfer.files));
        }}
        style={{
          border: `2px dashed ${COLORS.border}`,
          borderRadius: 12,
          padding: '32px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 24,
          background: `${COLORS.surface}80`,
          transition: 'border-color 0.2s',
        }}
      >
        <div style={{ fontSize: 14, color: COLORS.textDim, marginBottom: 6 }}>
          Drop CSV files here or click to upload
        </div>
        <div style={{ fontSize: 11, color: COLORS.textMuted }}>
          Files will be ingested into the motion pipeline
        </div>
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
        <button onClick={loadSwings} style={{
          marginLeft: 'auto', padding: '6px 14px', borderRadius: 5, fontSize: 10,
          fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
          background: `${COLORS.gold}15`, border: `1px solid ${COLORS.gold}40`, color: COLORS.gold,
        }}>
          REFRESH
        </button>
      </div>

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
                onClick={() => setExpandedSwing(isExpanded ? null : id)}
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
                </div>

                {/* Expandable detail */}
                {isExpanded && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      {/* Features */}
                      <div>
                        <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                          FEATURES
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.textDim }}>
                          Feature count: {swing.feature_count ?? swing.features?.length ?? '\u2014'}
                        </div>
                      </div>

                      {/* Topology summary */}
                      <div>
                        <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                          TOPOLOGY
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.textDim }}>
                          Betti-0: {swing.betti_0 ?? swing.topology?.betti_0 ?? '\u2014'}
                        </div>
                        <div style={{ fontSize: 12, color: COLORS.textDim }}>
                          Total persistence: {swing.total_persistence ?? swing.topology?.total_persistence ?? '\u2014'}
                        </div>
                      </div>
                    </div>

                    {/* Classification details */}
                    {swing.classification && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 9, color: COLORS.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                          CLASSIFICATION DETAILS
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
                  </div>
                )}
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
