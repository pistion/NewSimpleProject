/**
 * templateSource.stage.js - 02-TEMPLATE-SOURCE-MOUNTAIN
 *
 * Resolves the template source currently supplied by the frontend bundle.
 * Future versions can fetch template files from TEMPLATE_LIBRARY_REPO_URL.
 */

import { badRequest } from '../../00-SHARED/stageErrors.js';

export function resolveTemplateSource(input = {}, template = {}) {
  const html = input.templateHtml || template.html || '';
  if (!html || typeof html !== 'string') {
    throw badRequest('templateHtml (string) is required.', 'template_source', 'TEMPLATE_HTML_REQUIRED');
  }
  if (html.length > 200_000) {
    throw badRequest('templateHtml exceeds 200 kB limit.', 'template_source', 'TEMPLATE_HTML_TOO_LARGE');
  }
  return { html, sourceType: 'frontend-bundled-html' };
}

export async function runStage(context) {
  context.template = { ...context.template, ...resolveTemplateSource(context.input || {}, context.template || {}) };
  return context;
}
