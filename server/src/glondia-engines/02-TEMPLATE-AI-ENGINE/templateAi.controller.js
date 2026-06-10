/**
 * templateAi.controller.js — 02-TEMPLATE-AI-ENGINE
 *
 * Express controller handling all Template AI routes:
 *
 *   GET  /api/template-ai/templates              — list available templates
 *   GET  /api/template-ai/config/:templateId     — get wizard config for a template
 *   POST /api/template-ai/assist                 — per-field AI assist
 *   POST /api/template-ai/clean                  — batch clean all fields
 *   POST /api/template-ai/generate               — full template generation → ZIP
 *   POST /api/template-ai/deploy                 — generate + push to GitHub (returns repo info)
 */

import path from 'node:path';
import fs   from 'node:fs';
import { fileURLToPath } from 'node:url';

import { generateSiteFromTemplate, getTemplateWizardConfig, listTemplates } from './templateAi.service.js';
import { assistField, cleanAllFields } from './templateAiAssist.service.js';
import { pushGeneratedSiteToGitHub }   from './templateAiGithub.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Local temp dir for generated ZIPs before GitHub push
const TEMP_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), '.glondia-data'), 'template-ai-temp');

// ── List templates ────────────────────────────────────────────────────────────

export async function getTemplateList(req, res) {
  try {
    const templates = listTemplates();
    res.json({ ok: true, templates });
  } catch (err) {
    console.error('[template-ai] list error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ── Template wizard config ────────────────────────────────────────────────────

export async function getTemplateConfig(req, res) {
  try {
    const config = getTemplateWizardConfig(req.params.templateId);
    res.json({ ok: true, config });
  } catch (err) {
    console.error('[template-ai] config error:', err.message);
    res.status(404).json({ ok: false, error: err.message });
  }
}

// ── Per-field AI assist ───────────────────────────────────────────────────────

export async function handleAssistField(req, res) {
  const { fieldName, currentValue, context, templateId } = req.body || {};
  if (!fieldName) return res.status(400).json({ ok: false, error: 'fieldName is required.' });
  if (!templateId) return res.status(400).json({ ok: false, error: 'templateId is required.' });

  try {
    const result = await assistField({ fieldName, currentValue: currentValue || '', context: context || {}, templateId });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[template-ai] assist error:', err.message);
    res.status(500).json({ ok: false, error: 'AI assist failed. Please try again.' });
  }
}

// ── Batch field cleanup ───────────────────────────────────────────────────────

export async function handleCleanFields(req, res) {
  const { config, templateId } = req.body || {};
  if (!config)     return res.status(400).json({ ok: false, error: 'config is required.' });
  if (!templateId) return res.status(400).json({ ok: false, error: 'templateId is required.' });

  try {
    const result = await cleanAllFields({ config, templateId });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[template-ai] clean error:', err.message);
    res.status(500).json({ ok: false, error: 'AI cleanup failed. Please try again.' });
  }
}

// ── Full generation → ZIP download ───────────────────────────────────────────

export async function handleGenerate(req, res) {
  const { templateId, clientConfig, clientId } = req.body || {};
  if (!templateId)    return res.status(400).json({ ok: false, error: 'templateId is required.' });
  if (!clientConfig)  return res.status(400).json({ ok: false, error: 'clientConfig is required.' });

  const userId   = clientId || req.user?.id || 'anon';
  const deployId = `${userId}-DEP-${Date.now()}`;

  try {
    console.log(`[template-ai] generating ${templateId} for ${deployId}`);
    const result = await generateSiteFromTemplate({ templateId, clientConfig, clientId: userId, deployId });

    // Return ZIP as download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.slug}-site.zip"`);
    res.setHeader('X-Deploy-Id', deployId);
    res.setHeader('X-Slug', result.slug);
    res.send(result.zipBuffer);
  } catch (err) {
    console.error('[template-ai] generate error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ── Generate + push to GitHub (main pipeline) ────────────────────────────────

export async function handleDeploy(req, res) {
  const { templateId, clientConfig, clientId } = req.body || {};
  if (!templateId)   return res.status(400).json({ ok: false, error: 'templateId is required.' });
  if (!clientConfig) return res.status(400).json({ ok: false, error: 'clientConfig is required.' });

  const userId   = clientId || req.user?.id || 'anon';
  const deployId = `${userId}-DEP-${Date.now()}`;

  try {
    // Step 1 — AI generates the site
    console.log(`[template-ai] [${deployId}] step 1 — AI generation`);
    const generated = await generateSiteFromTemplate({ templateId, clientConfig, clientId: userId, deployId });

    // Step 2 — push to GitHub
    console.log(`[template-ai] [${deployId}] step 2 — GitHub push`);
    const githubResult = await pushGeneratedSiteToGitHub({
      zipBuffer  : generated.zipBuffer,
      slug       : generated.slug,
      deployId,
      clientId   : userId,
      templateId,
      clientConfig
    });

    // Step 3 — respond with pre-filled Render config (user clicks deploy)
    res.json({
      ok: true,
      deployId,
      slug          : generated.slug,
      github        : githubResult,
      renderConfig  : {
        name       : generated.slug,
        repoUrl    : githubResult.repoUrl,
        branch     : githubResult.branch,
        rootDir    : githubResult.templatePath,
        buildCommand: 'npm install && npm run build',
        publishDir : 'dist',
        serviceType: 'static_site',
        plan       : 'free'
      },
      message: 'Site generated and pushed to GitHub. Review the config below and click Deploy to go live on Render.'
    });
  } catch (err) {
    console.error(`[template-ai] [${deployId}] deploy error:`, err.message);
    res.status(500).json({ ok: false, error: err.message, deployId });
  }
}
