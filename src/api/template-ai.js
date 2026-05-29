/**
 * template-ai.js — Frontend API helpers for AI-assisted template intake.
 * All calls go through the Express backend. The OpenAI key is never exposed here.
 */

import { liveApiRequest } from '../api.js';
import { authHeaders } from './auth.js';

function liveApiUrl(path) {
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}${path}` : `/api${path}`;
}

export async function startTemplateAiIntake(templateId) {
  return liveApiRequest('/template-ai/intake/start', {
    method: 'POST',
    body: { templateId },
  });
}

export async function sendTemplateAiMessage(sessionId, message, collectedAnswers = {}) {
  return liveApiRequest('/template-ai/intake/message', {
    method: 'POST',
    body: { sessionId, message, collectedAnswers },
  });
}

export async function generateTailoredTemplate(templateId, templateHtml, answers) {
  return liveApiRequest('/template-ai/generate', {
    method: 'POST',
    body: { templateId, templateHtml, answers },
  });
}

export async function createSiteFromTailoredTemplate(templateId, answers, tailoredPages) {
  return liveApiRequest('/template-ai/sites', {
    method: 'POST',
    body: { templateId, answers, tailoredPages },
  });
}

export async function getTailoredTemplateSite(siteId) {
  return liveApiRequest(`/template-ai/sites/${encodeURIComponent(siteId)}`, {
    method: 'GET',
  });
}

export function getTailoredTemplatePreviewUrl(siteId, page = 0) {
  const path = `/template-ai/sites/${encodeURIComponent(siteId)}/preview?page=${encodeURIComponent(page)}`;
  return liveApiUrl(path);
}

export async function getZipDeploySettings() {
  return liveApiRequest('/template-ai/zip/settings', { method: 'GET' });
}

export async function deployTailoredTemplate(siteId, deploymentSettings = {}) {
  return liveApiRequest(`/template-ai/sites/${encodeURIComponent(siteId)}/deploy`, {
    method: 'POST',
    body: deploymentSettings,
  });
}

/**
 * Deploy a ZIP file to the Render hosting pipeline.
 * Parses all backend error shapes: { error }, { message }, { error: { message } },
 * { code, error, details }, and non-JSON / HTML responses.
 */
export async function deployZipTemplate(file, settings = {}) {
  if (!file) throw new Error('Choose a ZIP file first.');
  const form = new FormData();
  form.append('siteZip', file);
  for (const [key, value] of Object.entries(settings || {})) {
    if (value !== undefined && value !== null && String(value).trim() !== '') form.append(key, String(value));
  }

  let response;
  try {
    response = await fetch(liveApiUrl('/template-ai/zip/deploy'), {
      method: 'POST',
      headers: { ...authHeaders() },
      body: form,
    });
  } catch (networkError) {
    throw new Error(`Network error: ${networkError.message || 'Could not reach the server.'}`);
  }

  // Try to parse JSON; fall back to raw text for HTML / unexpected responses
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
      throw new Error(text ? text.slice(0, 500) : `ZIP deploy failed with status ${response.status}.`);
    }
    // response.ok but not JSON — unlikely but handle gracefully
    return {};
  }

  if (!response.ok) {
    // Parse every error shape the backend might return
    const msg =
      (typeof result.error === 'string' ? result.error : null) ||
      (typeof result.error === 'object' && result.error?.message ? result.error.message : null) ||
      result.message ||
      (result.code ? `${result.code}: ${JSON.stringify(result.details || '')}` : null) ||
      `ZIP deploy failed with status ${response.status}.`;
    const err = new Error(msg);
    err.code = result.code || undefined;
    err.details = result.details || undefined;
    throw err;
  }

  return result?.data ?? result;
}
