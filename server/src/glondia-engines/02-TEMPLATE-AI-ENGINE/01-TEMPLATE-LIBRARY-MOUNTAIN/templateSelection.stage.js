/**
 * templateSelection.stage.js - 01-TEMPLATE-LIBRARY-MOUNTAIN
 *
 * Normalizes template selection metadata from the request.
 */

import { badRequest } from '../../00-SHARED/stageErrors.js';

export function selectTemplate(input = {}) {
  const templateId = String(input.templateId || '').trim();
  if (!templateId) throw badRequest('templateId is required.', 'template_selection', 'TEMPLATE_ID_REQUIRED');
  if (templateId.length > 100) throw badRequest('templateId is too long.', 'template_selection', 'TEMPLATE_ID_TOO_LONG');
  return {
    templateId,
    templateRepoUrl: input.templateRepoUrl || process.env.TEMPLATE_LIBRARY_REPO_URL || null,
    templatePath: input.templatePath || null,
    selectedVersion: input.selectedVersion || input.version || null,
    html: input.templateHtml || null,
  };
}

export async function runStage(context) {
  context.template = { ...context.template, ...selectTemplate(context.input || {}) };
  return context;
}
