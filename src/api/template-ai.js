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

export async function deployTailoredTemplate(siteId, deploymentSettings = {}) {
  return liveApiRequest(`/template-ai/sites/${encodeURIComponent(siteId)}/deploy`, {
    method: 'POST',
    body: deploymentSettings,
  });
}

export async function deployZipTemplate(file, settings = {}) {
  if (!file) throw new Error('Choose a ZIP file first.');
  const form = new FormData();
  form.append('siteZip', file);
  for (const [key, value] of Object.entries(settings || {})) {
    if (value !== undefined && value !== null && String(value).trim() !== '') form.append(key, String(value));
  }
  const response = await fetch(liveApiUrl('/template-ai/zip/deploy'), {
    method: 'POST',
    headers: {
      ...authHeaders(),
    },
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || result?.message || result?.error || `ZIP deploy failed with ${response.status}.`);
  }
  return result?.data ?? result;
}
