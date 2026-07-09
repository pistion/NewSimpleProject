/**
 * Feature flags — single source of truth for the paid MVP launch surface.
 *
 * Each flag is read from an env var (FEATURE_*) and falls back to the launch
 * default below. Only the MVP-ready features default to `true`; everything
 * else stays behind a Coming Soon gate until it is launch-ready.
 *
 * Keep these keys in sync with the frontend copy in src/app/features.js.
 */

const FLAG_DEFINITIONS = {
  SITE_BUILDER:         { env: 'FEATURE_SITE_BUILDER',         default: true,  label: 'Site Builder' },
  ZIP_HOSTING:          { env: 'FEATURE_ZIP_HOSTING',          default: true,  label: 'ZIP upload hosting' },
  GITHUB_HOSTING:       { env: 'FEATURE_GITHUB_HOSTING',       default: true,  label: 'GitHub upload/import hosting' },
  HOSTING_DASHBOARD:    { env: 'FEATURE_HOSTING_DASHBOARD',    default: true,  label: 'Hosting dashboard' },
  BILLING:              { env: 'FEATURE_BILLING',              default: true,  label: 'Billing' },
  EMAIL:                { env: 'FEATURE_EMAIL',                default: true,  label: 'Business Email' },
  // Domain names (registrar + buy flow) — active on the main customer dashboard.
  // Set FEATURE_DOMAINS=false to hide. Live purchase still needs Spaceship + PayPal env.
  DOMAINS:              { env: 'FEATURE_DOMAINS',              default: true,  label: 'Domains' },

  VPS:                  { env: 'FEATURE_VPS',                  default: false, label: 'Cloud Servers' },
  AI_BUILDER:           { env: 'FEATURE_AI_BUILDER',           default: false, label: 'RoxanneAI advanced builder' },
  TEMPLATE_MARKETPLACE: { env: 'FEATURE_TEMPLATE_MARKETPLACE', default: false, label: 'Template marketplace' },
  ANALYTICS:            { env: 'FEATURE_ANALYTICS',            default: false, label: 'Analytics' },
  SETTINGS:             { env: 'FEATURE_SETTINGS',             default: false, label: 'Settings' },
};

function readFlag(definition) {
  const raw = process.env[definition.env];
  if (raw === undefined || raw === '') return definition.default;
  return String(raw).trim().toLowerCase() === 'true';
}

/** Returns true when the named feature is enabled. */
export function isFeatureEnabled(name) {
  const definition = FLAG_DEFINITIONS[name];
  if (!definition) return false;
  return readFlag(definition);
}

/** Returns the human-readable label for a feature (used in Coming Soon messages). */
export function featureLabel(name) {
  return FLAG_DEFINITIONS[name]?.label || name;
}

/** Snapshot of every flag — exposed to the frontend via GET /api/v1/features. */
export function featureFlagSnapshot() {
  const snapshot = {};
  for (const [name, definition] of Object.entries(FLAG_DEFINITIONS)) {
    snapshot[name] = readFlag(definition);
  }
  return snapshot;
}

export { FLAG_DEFINITIONS };
