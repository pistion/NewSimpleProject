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

export async function listTemplateHostingTemplates() {
  return liveApiRequest('/template-ai/templates', { method: 'GET' });
}

export async function getTemplateHostingTemplate(templateId) {
  return liveApiRequest(`/template-ai/templates/${encodeURIComponent(templateId)}`, { method: 'GET' });
}

export async function createSiteFromTailoredTemplate(templateId, answers, tailoredPages, options = {}) {
  return liveApiRequest('/template-ai/sites', {
    method: 'POST',
    body: { templateId, answers, tailoredPages, ...options },
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

// Legacy compatibility only. New code should use src/api/hosting-deploy.js.
export async function getZipDeploySettings() {
  return liveApiRequest('/template-ai/zip/settings', { method: 'GET' });
}

export async function deployTailoredTemplate(siteId, deploymentSettings = {}) {
  return liveApiRequest(`/template-ai/sites/${encodeURIComponent(siteId)}/deploy`, {
    method: 'POST',
    body: deploymentSettings,
  });
}

export async function prepareTemplateHostingSite(siteId, settings = {}) {
  return liveApiRequest(`/template-ai/sites/${encodeURIComponent(siteId)}/prepare`, {
    method: 'POST',
    body: settings,
  });
}

export async function aiEditTemplateHostingSite(siteId, settings = {}) {
  return liveApiRequest(`/template-ai/sites/${encodeURIComponent(siteId)}/ai-edit`, {
    method: 'POST',
    body: settings,
  });
}

export async function packageTailoredTemplate(siteId, packageSettings = {}) {
  return liveApiRequest(`/template-ai/sites/${encodeURIComponent(siteId)}/package`, {
    method: 'POST',
    body: packageSettings,
  });
}

// Hybrid site plan API helpers
export async function createTemplateSitePlan(plan) {
  return liveApiRequest('/template-ai/plans', { method: 'POST', body: plan });
}
export async function getTemplateSitePlan(planId) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}`, { method: 'GET' });
}
export async function updateTemplateSitePlanPart(planId, part, value) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}/${part}`, { method: 'PUT', body: value });
}
export async function approveTemplateSitePlan(planId) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}/approve`, { method: 'POST' });
}
export async function handoffTemplateSitePlan(planId, options = {}) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}/handoff`, { method: 'POST', body: options });
}

// Settings (includes aiConfigured, aiModel)
export async function getTemplateAiSettings() {
  return liveApiRequest('/template-ai/settings', { method: 'GET' });
}

// Answer sheet CRUD for plans
export async function buildAnswerSheetForPlan(planId) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}/answer-sheet/build`, { method: 'POST' });
}
export async function generateAnswerSheetForPlan(planId) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}/answer-sheet/generate`, { method: 'POST' });
}
export async function getAnswerSheetForPlan(planId) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}/answer-sheet`, { method: 'GET' });
}
export async function updateAnswerSheetForPlan(planId, answerSheet) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}/answer-sheet`, { method: 'PUT', body: answerSheet });
}

// Phase 3 — AI refinement (requires AI_BUILDER feature)
export async function aiSuggestSitemapForPlan(planId) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}/ai/suggest-sitemap`, { method: 'POST' });
}
export async function aiAutofillOptionalBrief(planId) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}/ai/autofill-brief`, { method: 'POST' });
}
export async function aiSuggestSectionsForPage(planId, pageId) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}/ai/suggest-sections/${encodeURIComponent(pageId)}`, { method: 'POST' });
}
export async function aiSuggestWireframe(planId) {
  return liveApiRequest(`/template-ai/plans/${encodeURIComponent(planId)}/ai/suggest-wireframe`, { method: 'POST' });
}

// Per-question AI suggestion during RoxanneAI intake chat.
export async function suggestIntakeAnswer(questionKey, previousAnswers = {}) {
  return liveApiRequest('/template-ai/intake/suggest-answer', {
    method: 'POST',
    body: { questionKey, previousAnswers },
  });
}

/**
 * Legacy compatibility only. New code should use src/api/hosting-deploy.js.
 *
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
