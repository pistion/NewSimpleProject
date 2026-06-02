/**
 * Frontend gateway for Hosting Deploy Engine handoffs.
 *
 * Site Builder prepares source. Hosting Deploy Engine creates deployment records
 * and performs the Render handoff.
 *
 * Resilience: the deploy routes were split into /zip/deploy and
 * /github-link/deploy. If the running backend is older (the new route returns
 * the SPA index.html instead of JSON, or a 404), we automatically retry the
 * legacy /zip and /github aliases so a not-yet-redeployed backend still works.
 */

import { liveApiRequest } from '../api.js';
import { authFetch } from './auth.js';

function liveApiUrl(path) {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}${path}` : `/api${path}`;
}

/**
 * True when a request hit the SPA fallback instead of the API route — i.e. the
 * route does not exist on this backend (404, or a 200 that returned HTML).
 */
function isRouteMissing(response, contentType) {
  return response.status === 404 || (response.ok && !String(contentType || '').includes('application/json'));
}

/** Parse a deploy response, throwing a clear error for any failure shape. */
async function parseDeployResponse(response, label = 'Deployment') {
  const contentType = response.headers.get('content-type') || '';
  let result = null;
  if (contentType.includes('application/json')) {
    result = await response.json().catch(() => null);
  } else {
    await response.text().catch(() => '');
  }
  if (!response.ok) {
    const errorCode = result?.error?.code || result?.code || undefined;
    const stage = result?.stage || result?.error?.stage || undefined;
    const requestId = result?.requestId || undefined;
    const msg =
      (typeof result?.error === 'string' ? result.error : null) ||
      result?.error?.message ||
      result?.message ||
      (errorCode ? `${errorCode}: ${JSON.stringify(result?.details || result?.error?.details || '')}` : null) ||
      `${label} failed with status ${response.status}.`;
    const suffix = [stage ? `stage: ${stage}` : null, requestId ? `request: ${requestId}` : null].filter(Boolean).join(', ');
    const err = new Error(suffix ? `${msg} (${suffix})` : msg);
    err.code = errorCode;
    err.stage = stage;
    err.requestId = requestId;
    err.details = result?.details || result?.error?.details || undefined;
    throw err;
  }
  // A successful-but-non-JSON response means the route is missing on this backend.
  if (!result) {
    const err = new Error(`${label} route is unavailable on the server. The backend may need to be redeployed.`);
    err.code = 'DEPLOY_ROUTE_UNAVAILABLE';
    throw err;
  }
  return result?.data ?? result;
}

async function postJsonWithFallback(newPath, oldPath, body, label) {
  const send = async (path) => {
    try {
      return await authFetch(liveApiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
    } catch (networkError) {
      throw new Error(`Network error: ${networkError.message || 'Could not reach the server.'}`);
    }
  };
  let response = await send(newPath);
  if (oldPath && isRouteMissing(response, response.headers.get('content-type'))) {
    response = await send(oldPath);
  }
  return parseDeployResponse(response, label);
}

export async function getHostingDeploySettings() {
  return liveApiRequest('/deployments/settings', { method: 'GET' });
}

export async function createGithubHostingDeployment(input = {}) {
  // New separated route; falls back to the legacy /deployments/github alias.
  return postJsonWithFallback('/deployments/github-link/deploy', '/deployments/github', input, 'GitHub deployment');
}

/**
 * Validate a GitHub repository link before deploying — checks the URL, parses
 * owner/repo, returns { repoUrl, owner, repo, branch, valid }. Does not import
 * the repo, create a record, or bill. Falls back to a light client-side parse
 * when the backend doesn't expose the validate route yet.
 */
export async function validateGithubLinkDeployment(input = {}) {
  let response;
  try {
    response = await authFetch(liveApiUrl('/deployments/github-link/validate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input || {}),
    });
  } catch (networkError) {
    throw new Error(`Network error: ${networkError.message || 'Could not reach the server.'}`);
  }
  if (isRouteMissing(response, response.headers.get('content-type'))) {
    const raw = String(input.repoUrl || input.repositoryUrl || input.githubUrl || '').trim().replace(/\.git$/i, '');
    const m = raw.match(/github\.com[:/]([^/]+)\/([^/#?]+)/i);
    if (!m) throw new Error('That does not look like a GitHub repository URL.');
    return { repoUrl: `https://github.com/${m[1]}/${m[2]}`, owner: m[1], repo: m[2], branch: input.branch || 'main', valid: true };
  }
  return parseDeployResponse(response, 'GitHub link validation');
}

export async function createGeneratedSiteHostingDeployment(input = {}) {
  return liveApiRequest('/deployments/generated-site', {
    method: 'POST',
    body: input,
  });
}

/**
 * Validate a ZIP before deploying — returns detected framework, deploy mode,
 * publish dir, build/start commands, required env hints, ignored folders, and
 * mode alternatives. Never creates a Render service. Falls back to the legacy
 * /deployments/zip/validate path (same path) and is tolerant of a missing route.
 */
export async function validateZipHostingDeployment(file) {
  if (!file) throw new Error('Choose a ZIP file first.');
  const buildForm = () => { const f = new FormData(); f.append('siteZip', file); return f; };

  let response;
  try {
    response = await authFetch(liveApiUrl('/deployments/zip/validate'), { method: 'POST', body: buildForm() });
  } catch (networkError) {
    throw new Error(`Network error: ${networkError.message || 'Could not reach the server.'}`);
  }

  // If the validate route isn't available, just skip the preview (don't block).
  if (isRouteMissing(response, response.headers.get('content-type'))) return {};

  let result = null;
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    result = await response.json().catch(() => null);
  }
  if (!response.ok) {
    const msg = (typeof result?.error === 'string' ? result.error : result?.error?.message) || result?.message || `ZIP validation failed with status ${response.status}.`;
    throw new Error(msg);
  }
  return result?.data ?? result ?? {};
}

/**
 * Create a Hosting Deploy Engine ZIP handoff. Tries /deployments/zip/deploy,
 * falls back to the legacy /deployments/zip alias when the new route is missing
 * (older backend), and surfaces a clear error instead of a cryptic parse failure.
 */
export async function createZipHostingDeployment(file, settings = {}) {
  if (!file) throw new Error('Choose a ZIP file first.');
  const buildForm = () => {
    const form = new FormData();
    form.append('siteZip', file);
    for (const [key, value] of Object.entries(settings || {})) {
      if (value !== undefined && value !== null && String(value).trim() !== '') form.append(key, String(value));
    }
    return form;
  };

  const send = async (path) => {
    try {
      return await authFetch(liveApiUrl(path), { method: 'POST', body: buildForm() });
    } catch (networkError) {
      throw new Error(`Network error: ${networkError.message || 'Could not reach the server.'}`);
    }
  };

  let response = await send('/deployments/zip/deploy');
  if (isRouteMissing(response, response.headers.get('content-type'))) {
    response = await send('/deployments/zip');
  }
  return parseDeployResponse(response, 'ZIP deployment');
}
