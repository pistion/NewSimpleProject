import { listTemplates, getTemplate, getTemplateLibraryConfig } from '../../../../services/templateLibrary.service.js';
import renderApiService from '../../../../services/renderApiService.js';

async function getSettings(req, res, next) {
  try {
    const config = getTemplateLibraryConfig();
    const openAiConfigured = Boolean(process.env.OPENAI_API_KEY);
    const renderConfigured = renderApiService.configured();
    const sourceRepoConfigured = Boolean((process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL || '').trim());

    res.json({
      // Canonical AI config fields (used by frontend to gate AI features)
      aiConfigured: openAiConfigured,
      aiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      // Legacy alias kept for backward compatibility
      openAiConfigured,
      renderConfigured,
      sourceRepoConfigured,
      sourceRepo: process.env.RENDER_GENERATED_SITES_REPO_URL || null,
      templateRepo: config.repoUrl,
      templateRoot: config.root,
      defaultRootDirectory: process.env.RENDER_GENERATED_SITES_ROOT_DIR || null,
      generatedTemplateSitesRoot: process.env.RENDER_GENERATED_TEMPLATE_SITES_ROOT_DIR || process.env.GENERATED_TEMPLATE_SITES_ROOT_DIR || 'generated-template-sites',
      missing: [
        !openAiConfigured ? 'OPENAI_API_KEY' : null,
        !sourceRepoConfigured ? 'RENDER_GENERATED_SITES_REPO_URL' : null,
        !renderConfigured ? 'RENDER_API_KEY / RENDER_OWNER_ID' : null,
      ].filter(Boolean),
    });
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    res.json(await listTemplates());
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    res.json(await getTemplate(req.params.templateId));
  } catch (err) { next(err); }
}

async function getPreview(req, res, next) {
  try {
    res.json({
      templateId: req.params.templateId,
      previewAvailable: false,
      previewType: 'client-side-srcDoc',
      note: 'Template HTML is bundled in the frontend. Use contentJson.pages[0].html from the GD.templates array for iframe preview via srcDoc.',
    });
  } catch (err) { next(err); }
}

export const templateLibraryController = { getSettings, list, getOne, getPreview };
