import { isLiveMode, modeBlockedResult } from '../app/config.js';

export async function triggerRenderDeploy(input = {}) {
  if (!isLiveMode()) return modeBlockedResult('render');
  try {
    const response = await fetch(renderApiUrl('/deployments/render'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || result?.message || `Render deploy failed with ${response.status}.`);
    return result;
  } catch (error) {
    return {
      status: 'unavailable',
      provider: 'render',
      message: error.message || 'Render deploy endpoint is unavailable.',
    };
  }
}

export async function testRenderDeploy(input = {}) {
  if (!isLiveMode()) return modeBlockedResult('render');
  try {
    const response = await fetch(renderApiUrl('/deployments/render'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, dryRun: true }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || result?.message || `Render test deploy failed with ${response.status}.`);
    return result;
  } catch (error) {
    return {
      status: 'unavailable',
      provider: 'render',
      message: error.message || 'Render test deploy endpoint is unavailable.',
    };
  }
}

export async function activateRenderRepo(input = {}) {
  if (!isLiveMode()) return modeBlockedResult('render');
  try {
    const response = await fetch(renderApiUrl('/deployments/render'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || result?.message || `Render repo activation failed with ${response.status}.`);
    return result;
  } catch (error) {
    return { status: 'unavailable', message: error.message || 'Render repo activation endpoint is unavailable.' };
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
    const response = await fetch(renderApiUrl('/render/settings'));
    if (!response.ok) throw new Error(`Render settings returned ${response.status}.`);
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
    const response = await fetch(renderApiUrl(`/render/deploys${qs}`));
    if (!response.ok) throw new Error(`Render deploy list returned ${response.status}.`);
    return response.json();
  } catch (error) {
    return { status: 'unavailable', deploys: [], error: error.message };
  }
}

export async function listLiveRenderServices() {
  if (!isLiveMode()) return [];
  try {
    const response = await fetch(renderApiUrl('/render/services'));
    if (!response.ok) throw new Error(`Render services returned ${response.status}.`);
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
