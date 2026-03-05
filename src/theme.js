export const COLORS = {
  bg: '#0a0c10',
  surface: '#12151c',
  surfaceHover: '#1a1e28',
  border: '#1e2330',
  borderActive: '#d4a843',
  gold: '#d4a843',
  goldDim: '#8a6e2f',
  goldBright: '#f0c95a',
  red: '#e04040',
  redDim: '#8b2020',
  green: '#3dba6f',
  greenDim: '#1d6b3a',
  blue: '#4a8fd4',
  blueDim: '#2a5580',
  text: '#e8e4dc',
  textDim: '#8a8678',
  textMuted: '#5a5850',
  orange: '#e08840',
  purple: '#9070d0',
  catImu: '#e04040',
  catFeatures: '#e08840',
  catTopology: '#9070d0',
  catLlm: '#4a8fd4',
  catData: '#3dba6f',
};

export const CATEGORY_COLORS = {
  imu: COLORS.catImu,
  features: COLORS.catFeatures,
  topology: COLORS.catTopology,
  llm: COLORS.catLlm,
  data: COLORS.catData,
};

export const CLASS_COLORS = {
  CLEAN: COLORS.green,
  NOISY: COLORS.red,
  MIXED: COLORS.orange,
  ANOMALY: COLORS.purple,
};
