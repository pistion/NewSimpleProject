/**
 * Frontend gateway for Hosting Deploy Engine handoffs.
 *
 * Site Builder prepares source. Hosting Deploy Engine creates deployment records
 * and performs the Render handoff.
 */

import { liveApiRequest } from '../api.js';
import { authFetch } from './auth.js';

function liveApiUrl(path) {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}${path}` : `/api${path}`;
}

export async function getHostingDeploySettings() {
  return liveApiRequest('/deployments/settings', { method: 'GET' });
}

export async function createGithubHostingDeployment(input = {}) {
  // New separated route. (Backend also keeps /deployments/github as an alias.)
  return liveApiRequest('/deployments/github-link/deploy', {
    method: 'POST',
    body: input,
  });
}

/**
 * Validate a GitHub repository link before deploying — checks the URL, parses
 * owner/repo, returns { repoUrl, owner, repo, branch, valid }. Does not import
 * the repo, create a record, or bill.
 */
export async function validateGithubLinkDeployment(input = {}) {
  return liveApiRequest('/deployments/github-link/validate', {
    method: 'POST',
    body: input,
  });
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
 * mode alternatives. Never creates a Render service.
 */
export async function validateZipHostingDeployment(file) {
  if (!file) throw new Error('Choose a ZIP file first.');
  const form = new FormData();
  form.append('siteZip', file);

  let response;
  try {
    response = await authFetch(liveApiUrl('/deployments/zip/validate'), {
      method: 'POST',
      body: form,
    });
  } catch (networkError) {
    throw new Error(`Network error: ${networkError.message || 'Could not reach the server.'}`);
  }

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
 * Create a Hosting Deploy Engine ZIP handoff.
 * Parses all backend error shapes: { error }, { message }, { error: { message } },
 * { code, error, details }, and non-JSON / HTML responses.
 */
export async function createZipHostingDeployment(file, settings = {}) {
  if (!file) throw new Error('Choose a ZIP file first.');
  const form = new FormData();
  form.append('siteZip', file);
  for (const [key, value] of Object.entries(settings || {})) {
    if (value !== undefined && value !== null && String(value).trim() !== '') form.append(key, String(value));
  }

  let response;
  try {
    // New separated route. (Backend also keeps /deployments/zip as an alias.)
    response = await authFetch(liveApiUrl('/deployments/zip/deploy'), {
      method: 'POST',
      body: form,
    });
  } catch (networkError) {
    throw new Error(`Network error: ${networkError.message || 'Could not reach the server.'}`);
  }

  let result;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      result = await response.json();
    } catch {
      result = null;
    }
  }
  if (!result) {
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(text ? text.slice(0, 500) : `ZIP handoff failed with status ${response.status}.`);
    }
    return {};
  }

  if (!response.ok) {
    const msg =
      (typeof result.error === 'string' ? result.error : null) ||
      (typeof result.error === 'object' && result.error?.message ? result.error.message : null) ||
      result.message ||
      (result.code ? `${result.code}: ${JSON.stringify(result.details || '')}` : null) ||
      `ZIP handoff failed with status ${response.status}.`;
    const err = new Error(msg);
    err.code = result.code || undefined;
    err.details = result.details || undefined;
    throw err;
  }

  return result?.data ?? result;
}
