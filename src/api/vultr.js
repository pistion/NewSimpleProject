import { authHeaders } from './auth.js';

function liveApiUrl(path) {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}${path}` : `/api${path}`;
}

async function vpsRequest(path, options = {}) {
  const response = await fetch(liveApiUrl(path), {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders(),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || result?.error?.message || `VPS request failed (${response.status}).`);
  }
  return result?.data ?? result;
}

// ─── Settings / catalog ────────────────────────────────────────────────────────

export function getVultrSettings() {
  return vpsRequest('/v1/vps-hosting/settings');
}

export function listVultrRegions() {
  return vpsRequest('/v1/vps-hosting/regions');
}

export function listVultrPlans(type) {
  const qs = type ? `?type=${encodeURIComponent(type)}` : '';
  return vpsRequest(`/v1/vps-hosting/plans${qs}`);
}

export function listVultrOperatingSystems() {
  return vpsRequest('/v1/vps-hosting/os');
}

// ─── Quote ─────────────────────────────────────────────────────────────────────

export function getVpsQuote({ region, plan, osId }) {
  return vpsRequest('/v1/vps-hosting/quote', {
    method: 'POST',
    body: { region, plan, osId },
  });
}

// ─── Deploy (usage-billed) ─────────────────────────────────────────────────────

export function deployVpsService(provisionDetails) {
  return vpsRequest('/v1/vps-hosting/services', {
    method: 'POST',
    body: provisionDetails,
  });
}

// ─── VPS service management ────────────────────────────────────────────────────

export function listVpsServices() {
  return vpsRequest('/v1/vps-hosting/services');
}

export function getVpsService(id) {
  return vpsRequest(`/v1/vps-hosting/services/${encodeURIComponent(id)}`);
}

export function startVpsService(id) {
  return vpsRequest(`/v1/vps-hosting/services/${encodeURIComponent(id)}/start`, { method: 'POST' });
}

export function haltVpsService(id) {
  return vpsRequest(`/v1/vps-hosting/services/${encodeURIComponent(id)}/halt`, { method: 'POST' });
}

export function rebootVpsService(id) {
  return vpsRequest(`/v1/vps-hosting/services/${encodeURIComponent(id)}/reboot`, { method: 'POST' });
}

export function destroyVpsService(id) {
  return vpsRequest(`/v1/vps-hosting/services/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
