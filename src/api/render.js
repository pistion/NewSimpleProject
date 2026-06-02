import { isLiveMode, modeBlockedResult } from '../app/config.js';
import { authFetch } from './auth.js';

export async function triggerRenderDeploy(input = {}) {
  if (!isLiveMode()) return modeBlockedResult('render');
  try {
    const response = await authFetch(renderApiUrl('/deployments/render'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || result?.message || `Deployment failed with ${response.status}.`);
    return result;
  } catch (error) {
    return {
      status: 'unavailable',
      provider: 'render',
      message: error.message || 'The deployment service is unavailable.',
    };
  }
}

export async function testRenderDeploy(input = {}) {
  if (!isLiveMode()) return modeBlockedResult('render');
  try {
    const response = await authFetch(renderApiUrl('/deployments/render'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, dryRun: true }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || result?.message || `Test deployment failed with ${response.status}.`);
    return result;
  } catch (error) {
    return {
      status: 'unavailable',
      provider: 'render',
      message: error.message || 'The test deployment service is unavailable.',
    };
  }
}

export async function activateRenderRepo(input = {}) {
  if (!isLiveMode()) return modeBlockedResult('render');
  try {
    const response = await authFetch(renderApiUrl('/deployments/render'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || result?.message || `Repository activation failed with ${response.status}.`);
    return result;
  } catch (error) {
    return { status: 'unavailable', message: error.message || 'The repository activation service is unavailable.' };
  }
}

export async function getRenderSettings() {
  if (!isLiveMode()) {
    return {
      provider: 'render',
      configured: false,
      customerServiceReady: false,
      required: ['VITE_APP_MODE=live', 'RENDER_API_KEY', 'RENDER_OWNER_ID'],
      error: modeBlockedResult('render').message,
    };
  }
  try {
    const response = await authFetch(renderApiUrl('/render/settings'));
    if (!response.ok) throw new Error(`Hosting settings returned ${response.status}.`);
    return response.json();
  } catch (error) {
    return {
      provider: 'render',
      configured: false,
      customerServiceReady: false,
      required: ['RENDER_API_KEY', 'RENDER_OWNER_ID'],
      error: error.message,
    };
  }
}

export async function listRenderDeploys(input = {}) {
  if (!isLiveMode()) return { status: 'demo', deploys: [], error: modeBlockedResult('render').message };
  try {
    const qs = input.serviceId ? `?serviceId=${encodeURIComponent(input.serviceId)}` : '';
    const response = await authFetch(renderApiUrl(`/render/deploys${qs}`));
    if (!response.ok) throw new Error(`Deployment list returned ${response.status}.`);
    return response.json();
  } catch (error) {
    return { status: 'unavailable', deploys: [], error: error.message };
  }
}

export async function listLiveRenderServices() {
  if (!isLiveMode()) return [];
  try {
    const response = await authFetch(renderApiUrl('/render/services'));
    if (!response.ok) throw new Error(`Hosting services returned ${response.status}.`);
    return response.json();
  } catch {
    return [];
  }
}

function renderApiUrl(path) {
  const configured = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  if (!configured) return `/api${path}`;
  return `${configured}${path}`;
}
