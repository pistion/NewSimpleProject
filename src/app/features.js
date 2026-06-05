// Frontend feature flags — mirrors server/src/config/featureFlags.js.
//
// Defaults match the paid MVP launch surface: only launch-ready features are
// on. Each flag can be overridden at build time with a VITE_FEATURE_* env var
// (e.g. VITE_FEATURE_DOMAINS=true).

const DEFAULTS = {
  siteBuilder: true,
  zipHosting: true,
  githubHosting: true,
  hostingDashboard: true,
  billing: true,

  domains: false,
  vps: false,
  aiBuilder: false,
  templateMarketplace: true,
  analytics: false,
  settings: false,
  activity: false,
};

// Map each feature key to its VITE_FEATURE_* override env var.
const ENV_KEYS = {
  siteBuilder: 'VITE_FEATURE_SITE_BUILDER',
  zipHosting: 'VITE_FEATURE_ZIP_HOSTING',
  githubHosting: 'VITE_FEATURE_GITHUB_HOSTING',
  hostingDashboard: 'VITE_FEATURE_HOSTING_DASHBOARD',
  billing: 'VITE_FEATURE_BILLING',
  domains: 'VITE_FEATURE_DOMAINS',
  vps: 'VITE_FEATURE_VPS',
  aiBuilder: 'VITE_FEATURE_AI_BUILDER',
  templateMarketplace: 'VITE_FEATURE_TEMPLATE_MARKETPLACE',
  analytics: 'VITE_FEATURE_ANALYTICS',
  settings: 'VITE_FEATURE_SETTINGS',
  activity: 'VITE_FEATURE_ACTIVITY',
};

function resolve(key) {
  const raw = ENV_KEYS[key] ? import.meta.env[ENV_KEYS[key]] : undefined;
  if (raw === undefined || raw === '') return DEFAULTS[key];
  return String(raw).trim().toLowerCase() === 'true';
}

export const FEATURES = Object.keys(DEFAULTS).reduce((acc, key) => {
  acc[key] = resolve(key);
  return acc;
}, {});

export function isFeatureEnabled(key) {
  return Boolean(FEATURES[key]);
}

// Maps an App.jsx route view → the feature flag it belongs to.
// Views not listed here are always available (auth, overview, core hosting/builder).
export const VIEW_FEATURE = {
  'domains-mine': 'domains',
  'domains-buy': 'domains',
  dns: 'domains',
  'vps-hosting': 'vps',
  'vps-create': 'vps',
  'vps-detail': 'vps',
  'builder-roxanne': 'aiBuilder',
  'builder-templates': 'templateMarketplace',
  analytics: 'analytics',
  activity: 'activity',
  settings: 'settings',
};

/** Returns true if the given route view is gated behind a disabled feature. */
export function isViewComingSoon(view) {
  const feature = VIEW_FEATURE[view];
  return Boolean(feature) && !isFeatureEnabled(feature);
}
