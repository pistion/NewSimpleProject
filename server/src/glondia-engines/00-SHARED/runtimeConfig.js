/**
 * runtimeConfig.js — 00-SHARED
 *
 * Single source of truth for all environment variable resolution.
 * Both engines read config from here. Never read process.env directly
 * inside a stage — call getRuntimeConfig() instead.
 *
 * Moved from: server/src/services/runtimeConfig.js
 * Original kept as a thin re-export for backward compatibility.
 */

const PLACEHOLDER_PATTERNS = [
  'your_', 'xxx', 'example', 'replace_me', 'change_me',
  'YOUR_USER_OR_ORG', 'YOUR_ORG_OR_USER',
];

export function isBlank(value) {
  return !String(value || '').trim();
}

export function isPlaceholder(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  return PLACEHOLDER_PATTERNS.some((p) => text.toLowerCase().includes(String(p).toLowerCase()));
}

export function hasRealValue(value) {
  return !isBlank(value) && !isPlaceholder(value);
}

export function normalizeRoot(value) {
  return String(value || '').replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+$/g, '');
}

/**
 * Sanitize a GitHub token coming from an env var / .env file / dashboard.
 * Strips surrounding quotes and stray whitespace/newlines that otherwise cause
 * GitHub to reject the credential with 401 "Bad credentials". PEM private keys
 * (GitHub App keys) are left intact — their internal newlines are significant.
 */
export function cleanGithubToken(value) {
  let s = String(value ?? '').trim();
  if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
    s = s.slice(1, -1).trim();
  }
  // Personal-access / installation tokens never contain whitespace; collapse any
  // stray spaces or newlines. Do NOT touch multi-line PEM keys.
  if (!s.includes('BEGIN')) s = s.replace(/\s+/g, '');
  return s;
}

/**
 * Resolve all runtime configuration from environment variables.
 * Returns a single config object — call once per request, pass around.
 */
export function getRuntimeConfig() {
  const renderApiKey    = process.env.RENDER_API_KEY;
  const renderOwnerId   = process.env.RENDER_OWNER_ID;
  const generatedRepo   = process.env.RENDER_GENERATED_SITES_REPO_URL;
  const githubToken     = cleanGithubToken(process.env.GITHUB_GENERATED_SITES_TOKEN || process.env.GITHUB_TOKEN);

  return {
    // ── Render ──────────────────────────────────────────────────────────
    renderConfigured:        hasRealValue(renderApiKey) && hasRealValue(renderOwnerId),
    renderApiKey:            hasRealValue(renderApiKey)  ? renderApiKey  : '',
    renderOwnerId:           hasRealValue(renderOwnerId) ? renderOwnerId : '',
    missingRender:           [
      !hasRealValue(renderApiKey)   ? 'RENDER_API_KEY'   : null,
      !hasRealValue(renderOwnerId)  ? 'RENDER_OWNER_ID'  : null,
    ].filter(Boolean),

    // ── GitHub publisher ─────────────────────────────────────────────────
    githubPublisherConfigured: hasRealValue(generatedRepo) && hasRealValue(githubToken),
    generatedSitesRepo:      hasRealValue(generatedRepo)  ? generatedRepo  : '',
    githubPublisherToken:    hasRealValue(githubToken)     ? githubToken    : '',
    generatedSitesRootDir:   normalizeRoot(process.env.RENDER_GENERATED_SITES_ROOT_DIR || 'uploaded-sites'),
    missingGithubPublisher:  [
      !hasRealValue(generatedRepo)  ? 'RENDER_GENERATED_SITES_REPO_URL'          : null,
      !hasRealValue(githubToken)    ? 'GITHUB_GENERATED_SITES_TOKEN or GITHUB_TOKEN' : null,
    ].filter(Boolean),

    // ── GitHub App (for private-key token exchange) ──────────────────────
    githubClientId:    process.env.GITHUB_CLIENT_ID    || '',
    githubAppId:       process.env.GITHUB_APP_ID       || '',
    githubDefaultBranch: process.env.GITHUB_DEFAULT_BRANCH || 'main',

    // ── Data storage ─────────────────────────────────────────────────────
    dataDir: process.env.DATA_DIR || '',
  };
}
