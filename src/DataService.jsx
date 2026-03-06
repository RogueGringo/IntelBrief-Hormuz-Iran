/**
 * DataService — fetches motion intelligence data from FastAPI backend.
 * Preserves caching and fallback patterns from original dashboard.
 */

const API_BASE = '';

// Cache layer
const cache = new Map();

function getCached(key, ttlMs) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// Classification keywords — CLEAN / NOISY
const CLEAN_KEYWORDS = [
  'address', 'backswing', 'top', 'downswing', 'impact', 'follow', 'finish',
  'persistent', 'stable', 'coherent', 'converged', 'consistent',
  'calibrated', 'synchronized', 'complete', 'valid', 'within-range',
  'extracted', 'resolved', 'detected', 'matched', 'baseline-aligned',
  'phase', 'transition', 'acceleration', 'peak', 'velocity',
];

const NOISY_KEYWORDS = [
  'saturated', 'clipped', 'dropout', 'drift', 'desync', 'interpolated',
  'ambiguous', 'overlap', 'missed', 'uncertain', 'low-confidence',
  'degenerate', 'unstable', 'divergent', 'sparse', 'insufficient',
  'missing', 'partial', 'corrupted', 'outlier', 'rejected',
  'error', 'failed', 'timeout', 'overflow', 'underflow',
];

export function classifyText(text) {
  const lower = text.toLowerCase();
  const cleanHits = CLEAN_KEYWORDS.filter(kw => lower.includes(kw)).length;
  const noisyHits = NOISY_KEYWORDS.filter(kw => lower.includes(kw)).length;
  const total = cleanHits + noisyHits;
  if (total === 0) return { classification: 'MIXED', confidence: 0, cleanHits: 0, noisyHits: 0 };
  const score = (cleanHits - noisyHits) / total;
  const classification = score > 0.15 ? 'CLEAN' : score < -0.15 ? 'NOISY' : 'MIXED';
  const confidence = Math.min(100, Math.round((total / 8) * 100));
  return { classification, confidence, cleanHits, noisyHits };
}

// Topology chain terms
export const CHAIN_TERMS = {
  imu_integrity: ['sample', 'rate', 'drift', 'noise', 'calibrat', 'saturat', 'sensor'],
  kinematic: ['phase', 'segment', 'backswing', 'downswing', 'impact', 'address', 'finish'],
  persistence: ['betti', 'homology', 'persistence', 'birth', 'death', 'diagram', 'point cloud'],
  sheaf_coherence: ['sheaf', 'coherence', 'fiber', 'restriction', 'bundle', 'joint'],
  llm_confidence: ['embedding', 'classification', 'confidence', 'inference', 'model', 'token'],
};

// API fetchers
export async function fetchSwings() {
  const cached = getCached('swings', 30000);
  if (cached) return cached;
  try {
    const resp = await fetch(`${API_BASE}/api/swings`);
    const data = await resp.json();
    setCache('swings', data);
    return data;
  } catch (e) {
    console.error('fetchSwings failed:', e);
    return [];
  }
}

export async function fetchSwing(id) {
  const cached = getCached(`swing-${id}`, 0);
  if (cached) return cached;
  try {
    const resp = await fetch(`${API_BASE}/api/swing/${id}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    setCache(`swing-${id}`, data);
    return data;
  } catch (e) {
    console.error(`fetchSwing ${id} failed:`, e);
    return null;
  }
}

export async function fetchSignals() {
  const cached = getCached('signals', 5000);
  if (cached) return cached;
  try {
    const resp = await fetch(`${API_BASE}/api/signals`);
    const data = await resp.json();
    setCache('signals', data);
    return data;
  } catch (e) {
    console.error('fetchSignals failed:', e);
    return { signals: [], categories: {} };
  }
}

export async function fetchLLMStatus() {
  try {
    const resp = await fetch(`${API_BASE}/api/llm/status`);
    return await resp.json();
  } catch (e) {
    console.error('fetchLLMStatus failed:', e);
    return { gpu_model: null, cpu_model: null, gpu_loaded: false, cpu_loaded: false };
  }
}

export async function fetchModels() {
  try {
    const resp = await fetch(`${API_BASE}/api/models`);
    return await resp.json();
  } catch (e) {
    console.error('fetchModels failed:', e);
    return [];
  }
}

export async function fetchBaselines() {
  const cached = getCached('baselines', 30000);
  if (cached) return cached;
  try {
    const resp = await fetch(`${API_BASE}/api/baselines`);
    const data = await resp.json();
    setCache('baselines', data);
    return data;
  } catch (e) {
    return [];
  }
}

export async function ingestSwing(file, groundTruth = {}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('ground_truth', JSON.stringify(groundTruth));
  const resp = await fetch(`${API_BASE}/api/ingest`, { method: 'POST', body: formData });
  cache.delete('swings');
  return await resp.json();
}

export async function analyzeSwing(id) {
  const resp = await fetch(`${API_BASE}/api/analyze/${id}`, { method: 'POST' });
  cache.delete(`swing-${id}`);
  cache.delete('swings');
  return await resp.json();
}

export async function coachSwing(id) {
  const resp = await fetch(`${API_BASE}/api/coach/${id}`, { method: 'POST' });
  cache.delete(`swing-${id}`);
  return await resp.json();
}

export async function compareSwings(a, b) {
  const resp = await fetch(`${API_BASE}/api/compare?a=${a}&b=${b}`);
  return await resp.json();
}

export async function swapModel(slot, modelPath, modelName) {
  const resp = await fetch(`${API_BASE}/api/models/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot, model_path: modelPath, model_name: modelName }),
  });
  return await resp.json();
}

export async function fetchAgentPlan() {
  const resp = await fetch(`${API_BASE}/api/agent/plan`);
  return await resp.json();
}

export async function fetchAgentDashboard() {
  const resp = await fetch(`${API_BASE}/api/agent/dashboard`);
  return await resp.json();
}

export async function triggerDistill() {
  const resp = await fetch(`${API_BASE}/api/distill`, { method: 'POST' });
  return await resp.json();
}

export async function triggerAgentLoop(maxCycles = 3) {
  const resp = await fetch(`${API_BASE}/api/agent/loop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_cycles: maxCycles }),
  });
  return await resp.json();
}
