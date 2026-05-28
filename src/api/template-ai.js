/**
 * template-ai.js — Frontend API helpers for AI-assisted template intake.
 * All calls go through the Express backend. The OpenAI key is never exposed here.
 */

import { liveApiRequest } from '../api.js';

/**
 * Start an AI intake session for a template.
 * @param {string} templateId
 * @returns {Promise<{ sessionId, question, questionKey, step, totalSteps, requiredFields, collectedAnswers }>}
 */
export async function startTemplateAiIntake(templateId) {
  return liveApiRequest('/template-ai/intake/start', {
    method: 'POST',
    body: { templateId },
  });
}

/**
 * Send the customer's answer to the current intake question.
 * @param {string} sessionId
 * @param {string} message        — Customer's typed answer (empty string = skip)
 * @param {object} collectedAnswers — Full answers collected client-side so far
 * @returns {Promise<{ sessionId, question, questionKey, step, collectedAnswers, complete }>}
 */
export async function sendTemplateAiMessage(sessionId, message, collectedAnswers = {}) {
  return liveApiRequest('/template-ai/intake/message', {
    method: 'POST',
    body: { sessionId, message, collectedAnswers },
  });
}

/**
 * Ask the backend to tailor an HTML template to the customer's answers.
 * The templateHtml is sent securely to the backend which calls OpenAI server-side.
 * @param {string} templateId
 * @param {string} templateHtml   — The original template HTML (from contentJson.pages[n].html)
 * @param {object} answers        — Collected intake answers
 * @returns {Promise<{ templateId, summary, answers, pages: [{title,path,html}] }>}
 */
export async function generateTailoredTemplate(templateId, templateHtml, answers) {
  return liveApiRequest('/template-ai/generate', {
    method: 'POST',
    body: { templateId, templateHtml, answers },
  });
}

/**
 * Persist a draft site record from the tailored output.
 * @param {string} templateId
 * @param {object} answers
 * @param {Array}  tailoredPages — [{title, path, html}]
 * @returns {Promise<{ siteId, templateId, answers, pages, status }>}
 */
export async function createSiteFromTailoredTemplate(templateId, answers, tailoredPages) {
  return liveApiRequest('/template-ai/sites', {
    method: 'POST',
    body: { templateId, answers, tailoredPages },
  });
}

/**
 * Retrieve a persisted tailored site by siteId.
 * @param {string} siteId
 * @returns {Promise<{ siteId, templateId, answers, pages, status, createdAt, updatedAt }>}
 */
export async function getTailoredTemplateSite(siteId) {
  return liveApiRequest(`/template-ai/sites/${encodeURIComponent(siteId)}`, {
    method: 'GET',
  });
}

/**
 * Build a browser-openable preview URL for a tailored site.
 * This returns the Express preview endpoint, not a temporary blob URL.
 */
export function getTailoredTemplatePreviewUrl(siteId, page = 0) {
  const path = `/template-ai/sites/${encodeURIComponent(siteId)}/preview?page=${encodeURIComponent(page)}`;
  const base = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
  return base ? `${base}${path}` : `/api${path}`;
}

/**
 * Trigger a deployment for a tailored site.
 * @param {string} siteId
 * @param {object} deploymentSettings — { siteName, serviceType, plan }
 * @returns {Promise<{ status, siteId, deploymentId, message }>}
 */
export async function deployTailoredTemplate(siteId, deploymentSettings = {}) {
  return liveApiRequest(`/template-ai/sites/${encodeURIComponent(siteId)}/deploy`, {
    method: 'POST',
    body: deploymentSettings,
  });
}
