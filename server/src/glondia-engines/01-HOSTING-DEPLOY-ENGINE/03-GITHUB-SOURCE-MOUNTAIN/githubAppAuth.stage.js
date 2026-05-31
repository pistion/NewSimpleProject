/**
 * githubAppAuth.stage.js - 03-GITHUB-SOURCE-MOUNTAIN
 *
 * GitHub App private-key token exchange for generated-sites publishing.
 */

import { createSign } from 'node:crypto';

// Short-lived installation token cache, keyed by installation id.
// GitHub installation tokens live ~1h; we refresh a minute before expiry.
const tokenCache = new Map();

export async function getGithubInstallationToken({ appId, clientId, privateKey, owner, repo }) {
  const issuer = appId || clientId;
  if (!issuer) throw new Error('GITHUB_APP_ID is required for GitHub App private-key publishing. GITHUB_CLIENT_ID is accepted only as a legacy fallback.');
  const normalizedKey = String(privateKey || '').replace(/\\n/g, '\n');
  const jwt = makeAppJwt(issuer, normalizedKey);
  const installation = owner && repo ? await findRepoInstallation(jwt, owner, repo) : await findFirstInstallation(jwt);
  return exchangeForToken(jwt, installation.id);
}

// ── Single source of truth for GitHub App auth ─────────────────────────────────

/**
 * Resolve GitHub App credentials from the environment.
 * Accepts a dedicated GITHUB_APP_PRIVATE_KEY, or a legacy GITHUB_GENERATED_SITES_TOKEN
 * / GITHUB_TOKEN that happens to hold an RSA private key.
 */
export function resolveAppCredentials() {
  const appId = process.env.GITHUB_APP_ID || process.env.GITHUB_APP_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '';
  let privateKey = process.env.GITHUB_APP_PRIVATE_KEY || '';
  if (!privateKey) {
    const legacy = process.env.GITHUB_GENERATED_SITES_TOKEN || process.env.GITHUB_TOKEN || '';
    if (legacy.includes('-----BEGIN')) privateKey = legacy;
  }
  return { appId, privateKey: String(privateKey || '').replace(/\\n/g, '\n') };
}

/**
 * Build a signed GitHub App JWT from the configured app credentials.
 */
export function createAppJwt() {
  const { appId, privateKey } = resolveAppCredentials();
  if (!appId) throw new Error('GITHUB_APP_ID (or GITHUB_APP_CLIENT_ID) is required to create a GitHub App JWT.');
  if (!privateKey) throw new Error('GITHUB_APP_PRIVATE_KEY is required to create a GitHub App JWT.');
  return makeAppJwt(appId, privateKey);
}

/**
 * Get an installation access token for a specific installation id, with caching.
 */
export async function getInstallationToken(installationId) {
  const id = String(installationId || '').trim();
  if (!id) throw new Error('installationId is required to get a GitHub App installation token.');
  const cached = tokenCache.get(id);
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token;
  const jwt = createAppJwt();
  const { token, expiresAt } = await exchangeForToken(jwt, id, { withExpiry: true });
  tokenCache.set(id, { token, expiresAt });
  return token;
}

/**
 * Get an installation token scoped to a specific repo (resolves the installation first).
 */
export async function getInstallationTokenForRepo({ owner, repo }) {
  const jwt = createAppJwt();
  const installation = await findRepoInstallation(jwt, owner, repo);
  return getInstallationToken(installation.id);
}

/**
 * Token used to read a client repository (Contents: Read).
 */
export function getClientInstallationToken(clientInstallationId) {
  return getInstallationToken(clientInstallationId);
}

/**
 * Token used to create/update Glondiasites-controlled repos (Contents: Read/Write).
 */
export function getPlatformInstallationToken() {
  const id = process.env.GITHUB_GLONDIASITES_INSTALLATION_ID;
  if (!id) throw new Error('GITHUB_GLONDIASITES_INSTALLATION_ID is required to get the platform installation token.');
  return getInstallationToken(id);
}

/**
 * True when GitHub App private-key auth is configured.
 */
export function githubAppConfigured() {
  const { appId, privateKey } = resolveAppCredentials();
  return Boolean(appId && privateKey);
}

function makeAppJwt(issuer, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: issuer }));
  const unsigned = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const sig = sign.sign(privateKey, 'base64url');
  return `${unsigned}.${sig}`;
}

async function findRepoInstallation(jwt, owner, repo) {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`, { headers: appHeaders(jwt) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub App is not installed on ${owner}/${repo} or lacks access (${res.status}): ${body}`);
  }
  return res.json();
}

async function findFirstInstallation(jwt) {
  const res = await fetch('https://api.github.com/app/installations', { headers: appHeaders(jwt) });
  if (!res.ok) throw new Error(`GitHub App installations lookup failed ${res.status}: ${await res.text().catch(() => '')}`);
  const list = await res.json();
  if (!list.length) throw new Error('GitHub App has no installations. Install it on the target account first.');
  return list[0];
}

async function exchangeForToken(jwt, installationId, { withExpiry = false } = {}) {
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, { method: 'POST', headers: appHeaders(jwt) });
  if (!res.ok) throw new Error(`GitHub App token exchange failed ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  if (!withExpiry) return data.token;
  return {
    token: data.token,
    expiresAt: data.expires_at ? Date.parse(data.expires_at) : Date.now() + 3_600_000,
  };
}

function appHeaders(jwt) {
  return { Accept: 'application/vnd.github+json', Authorization: `Bearer ${jwt}`, 'User-Agent': 'glondiasites-render-deploy-lab' };
}

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}
