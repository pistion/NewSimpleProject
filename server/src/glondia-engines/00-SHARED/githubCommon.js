/**
 * githubCommon.js — 00-SHARED
 *
 * Shared GitHub helpers: URL parsing, API headers, token resolution.
 * Both the GitHub Source Mountain and the Template AI Engine use these.
 *
 * Consolidates logic previously spread across:
 *   services/githubPublisher.js
 *   services/githubGeneratedSitePublisher.service.js
 *   services/githubAppAuth.js
 */

import { getGithubInstallationToken } from '../01-HOSTING-DEPLOY-ENGINE/03-GITHUB-SOURCE-MOUNTAIN/githubAppAuth.stage.js';
import { cleanGithubToken } from './runtimeConfig.js';

// ── URL parsing ───────────────────────────────────────────────────────────────

/**
 * Parse any GitHub repo URL into { owner, repo, fullName, url }.
 * Supports HTTPS, SSH, and owner/repo shorthand.
 * Returns null if not a valid GitHub repo reference.
 */
export function parseGithubRepoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const ssh = raw.match(/^git@github\.com:([^/]+)\/([^/.#?]+)(?:\.git)?$/i);
  if (ssh) return normalise(ssh[1], ssh[2]);

  const https = raw.match(/^https?:\/\/github\.com\/([^/]+)\/([^/.#?]+)(?:\.git)?\/?$/i);
  if (https) return normalise(https[1], https[2]);

  const shorthand = raw.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shorthand && !raw.includes('://')) return normalise(shorthand[1], shorthand[2].replace(/\.git$/i, ''));

  return null;
}

function normalise(owner, repo) {
  const o = String(owner || '').trim().replace(/^@/, '');
  const r = String(repo  || '').trim().replace(/\.git$/i, '').replace(/[?#].*$/, '');
  if (!o || !r) return null;
  return { owner: o, repo: r, fullName: `${o}/${r}`, url: `https://github.com/${o}/${r}` };
}

// ── Token resolution ──────────────────────────────────────────────────────────

/**
 * Resolve the best GitHub API token from environment.
 * Returns { token, isAppKey, error }.
 *
 * isAppKey = true means the token is a GitHub App private key and
 * must be exchanged for an installation token before making API calls.
 */
export function resolveGithubToken() {
  const raw = cleanGithubToken(
    process.env.GITHUB_GENERATED_SITES_TOKEN ||
    process.env.GENERATED_SITES_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    '',
  );

  if (!raw) {
    return {
      token: '', isAppKey: false,
      error: 'No GitHub token found. Set GITHUB_GENERATED_SITES_TOKEN (fine-grained PAT) or GITHUB_TOKEN.',
    };
  }

  // RSA private key → GitHub App key, needs installation token exchange
  if (raw.startsWith('-----BEGIN')) {
    return { token: raw, isAppKey: true, error: null };
  }

  return { token: raw, isAppKey: false, error: null };
}

/**
 * Exchange a GitHub App private key for an installation access token.
 * Returns the installation token string.
 *
 * @param {string} privateKey  PEM-encoded RSA private key
 * @param {string} owner       Optional repo owner (for repo-scoped install lookup)
 * @param {string} repo        Optional repo name
 */
export async function exchangeAppKeyForToken(privateKey, owner, repo) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const appId    = process.env.GITHUB_APP_ID;
  if (!clientId && !appId) {
    throw new Error('GITHUB_CLIENT_ID or GITHUB_APP_ID is required when GITHUB_TOKEN is a GitHub App private key.');
  }
  return getGithubInstallationToken({ clientId, appId, privateKey, owner, repo });
}

/**
 * Resolve and return a ready-to-use GitHub API token.
 * Handles App key exchange automatically.
 * Throws if no token is available or exchange fails.
 *
 * @param {string} [owner]  Optional: used for repo-scoped App install lookup
 * @param {string} [repo]   Optional
 */
export async function resolveReadyToken(owner, repo) {
  const { token, isAppKey, error } = resolveGithubToken();
  if (error) throw new Error(error);
  if (isAppKey) return exchangeAppKeyForToken(token, owner, repo);
  return token;
}

// ── API helpers ───────────────────────────────────────────────────────────────

/**
 * Standard GitHub API request headers.
 */
export function githubHeaders(token) {
  return {
    Authorization:      `Bearer ${token}`,
    Accept:             'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':     'application/json',
    'User-Agent':       'GlondiaSites',
  };
}

/**
 * URL-encode each segment of a file path for the GitHub Contents API.
 * e.g. "uploaded-sites/my site/index.html" → "uploaded-sites/my%20site/index.html"
 */
export function encodeGithubPath(pathValue) {
  return String(pathValue || '').split('/').map(encodeURIComponent).join('/');
}

/**
 * Clean a path: forward slashes, no leading/trailing slashes, no doubles.
 */
export function cleanPath(value = '') {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/');
}
