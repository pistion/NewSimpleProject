/*
 * template-ai.controller.js
 * Handles AI-assisted template intake, HTML tailoring, draft persistence, and Hosting handoff packaging.
 */

import { tailorHtmlTemplate, INTAKE_QUESTIONS, REQUIRED_KEYS } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/04-AI-REFINEMENT-MOUNTAIN/openaiTailor.stage.js';
import { makeId } from '../services/hostingStore.js';
import { createTemplateSite, getTemplateSite, updateTemplateSite } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/store/templateSiteStore.js';
import { generateViteStaticSiteFromTemplateSite } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/07-HANDOFF-TO-HOSTING-MOUNTAIN/finalSourcePackager.stage.js';
import { run as runGeneratedSiteToRender } from '../glondia-engines/01-HOSTING-DEPLOY-ENGINE/pipelines/generatedSiteToRender.pipeline.js';
import renderApiService from '../services/renderApiService.js';

const sessions = new Map();

function maybeCleanSessions() {
  if (sessions.size < 500) return;
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of sessions) if (new Date(s.createdAt).getTime() < cutoff) sessions.delete(id);
}

async function getSettings(req, res, next) {
  try {
    const sourceRepoConfigured = Boolean((process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL || '').trim());
    const renderConfigured = renderApiService.configured();
    const openAiConfigured = Boolean(process.env.OPENAI_API_KEY);
    res.json({
      openAiConfigured,
      renderConfigured,
      sourceRepoConfigured,
      sourceRepo: process.env.RENDER_GENERATED_SITES_REPO_URL || null,
      defaultRootDirectory: process.env.RENDER_GENERATED_SITES_ROOT_DIR || null,
      missing: [
        !openAiConfigured ? 'OPENAI_API_KEY' : null,
        !sourceRepoConfigured ? 'RENDER_GENERATED_SITES_REPO_URL' : null,
        !renderConfigured ? 'RENDER_API_KEY / RENDER_OWNER_ID' : null,
      ].filter(Boolean),
    });
  } catch (err) { next(err); }
}

async function startIntake(req, res, next) {
  try {
    const { templateId } = req.body || {};
    if (!templateId || typeof templateId !== 'string') return res.status(400).json({ error: 'templateId is required.' });
    if (templateId.length > 100) return res.status(400).json({ error: 'templateId is too long.' });
    maybeCleanSessions();
    const sessionId = makeId('intake');
    sessions.set(sessionId, { templateId, collectedAnswers: {}, step: 0, createdAt: new Date().toISOString() });
    const q = INTAKE_QUESTIONS[0];
    res.json({ sessionId, question: q.question, questionKey: q.key, questionLabel: q.label, step: 0, totalSteps: INTAKE_QUESTIONS.length, requiredFields: REQUIRED_KEYS, collectedAnswers: {} });
  } catch (err) { next(err); }
}

async function sendMessage(req, res, next) {
  try {
    const { sessionId, message, collectedAnswers } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') return res.status(400).json({ error: 'sessionId is required.' });
    if (message === undefined || message === null) return res.status(400).json({ error: 'message is required (use empty string to skip).' });
    if (typeof message !== 'string' || message.length > 2000) return res.status(400).json({ error: 'message must be a string under 2000 characters.' });
    const session = sessions.get(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found. Start a new intake.' });
    const currentQ = INTAKE_QUESTIONS[session.step];
    if (currentQ) session.collectedAnswers[currentQ.key] = message.trim().toLowerCase() === 'skip' ? '' : message.trim();
    if (collectedAnswers && typeof collectedAnswers === 'object') {
      for (const [k, v] of Object.entries(collectedAnswers)) {
        if (typeof k === 'string' && k.length < 60 && typeof v === 'string' && v.length < 2000) session.collectedAnswers[k] = session.collectedAnswers[k] ?? v;
      }
    }
    session.step += 1;
    const nextQ = INTAKE_QUESTIONS[session.step];
    res.json({ sessionId, question: nextQ?.question || null, questionKey: nextQ?.key || null, questionLabel: nextQ?.label || null, step: session.step, totalSteps: INTAKE_QUESTIONS.length, collectedAnswers: { ...session.collectedAnswers }, complete: !nextQ });
  } catch (err) { next(err); }
}

async function generateTailored(req, res, next) {
  try {
    const { templateId, templateHtml, answers } = req.body || {};
    if (!templateId || typeof templateId !== 'string') return res.status(400).json({ error: 'templateId is required.' });
    if (!templateHtml || typeof templateHtml !== 'string') return res.status(400).json({ error: 'templateHtml (string) is required.' });
    if (templateHtml.length > 200_000) return res.status(400).json({ error: 'templateHtml exceeds 200 kB limit.' });
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return res.status(400).json({ error: 'answers (object) is required.' });
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI tailoring is not available. OPENAI_API_KEY is not configured on this server.', code: 'OPENAI_NOT_CONFIGURED' });
    const tailored = await tailorHtmlTemplate(templateHtml, answers);
    res.json({ templateId, summary: `Tailored for ${answers.businessName || 'your business'}`, answers, pages: [{ title: 'Home', path: '/', html: tailored }] });
  } catch (err) { next(err); }
}

async function createSite(req, res, next) {
  try {
    const { templateId, answers, tailoredPages } = req.body || {};
    if (!templateId || typeof templateId !== 'string') return res.status(400).json({ error: 'templateId is required.' });
    if (templateId.length > 100) return res.status(400).json({ error: 'templateId is too long.' });
    if (answers !== undefined && (typeof answers !== 'object' || Array.isArray(answers))) return res.status(400).json({ error: 'answers must be an object.' });
    if (tailoredPages !== undefined && !Array.isArray(tailoredPages)) return res.status(400).json({ error: 'tailoredPages must be an array.' });
    const site = await createTemplateSite({ templateId, answers: answers || {}, tailoredPages: tailoredPages || [] });
    res.status(201).json({ siteId: site.siteId, templateId: site.templateId, answers: site.answers, pages: site.pages, status: site.status, createdAt: site.createdAt });
  } catch (err) { next(err); }
}

async function getSite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });
    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found.` });
    res.json(site);
  } catch (err) { next(err); }
}

async function previewSite(req, res, next) {
  try {
    const { siteId } = req.params;
    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).send('<!doctype html><html><body><h1>Preview not found</h1></body></html>');
    const pages = Array.isArray(site.pages) ? site.pages : [];
    const pageIndex = Math.max(0, Number(req.query.page || 0) || 0);
    const activePage = pages[pageIndex] || pages[0];
    if (!activePage?.html) return res.status(404).send('<!doctype html><html><body><h1>No generated preview available</h1></body></html>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(activePage.html);
  } catch (err) { next(err); }
}

async function packageSite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });
    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found. Complete the AI intake to create it.` });
    const handoff = await packageTemplateSiteForHosting(site, req.body || {});
    await updateTemplateSite(siteId, {
      status: 'ready_for_hosting',
      generatedSite: handoff.generatedSite,
      deploymentSettings: handoff.recommended,
    });
    res.json(handoff);
  } catch (err) { next(err); }
}

async function deploySite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });
    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found. Complete the AI intake to create it.` });

    const handoff = await packageTemplateSiteForHosting(site, req.body || {});
    const deployment = await runGeneratedSiteToRender({
      ...(req.body || {}),
      ...handoff,
      generatedSite: handoff.generatedSite,
      siteName: handoff.siteName,
      slug: handoff.slug,
      sourceReference: 'roxanne-ai-tailored-template',
    }, { userId: req.user?.id });

    await updateTemplateSite(siteId, {
      status: deployment?.status || 'ready_for_hosting',
      deploymentId: deployment?.deploymentId || deployment?.id || null,
      generatedSite: deployment?.generatedSite || handoff.generatedSite,
      render: deployment?.render || null,
      deploymentSettings: {
        ...handoff.recommended,
        repoUrl: deployment?.repoUrl || req.body?.repoUrl || req.body?.repositoryUrl || null,
        rootDirectory: deployment?.environmentConfiguration?.rootDirectory || handoff.recommended.rootDirectory,
      },
    });

    res.json({
      ...(deployment || {}),
      siteId,
      templateId: site.templateId,
      handoff,
      message: deployment?.render?.attempted
        ? 'Generated site handoff sent to Hosting and Render deployment started.'
        : 'Generated site handoff created. Check Hosting logs for configuration status.',
    });
  } catch (err) { next(err); }
}

async function getTemplatePreview(req, res, next) {
  try {
    const { templateId } = req.params;
    if (!templateId) return res.status(400).json({ error: 'templateId is required.' });
    res.json({ templateId, previewAvailable: false, previewType: 'client-side-srcDoc', note: 'Template HTML is bundled in the frontend. Use contentJson.pages[0].html from the GD.templates array for iframe preview via srcDoc.' });
  } catch (err) { next(err); }
}

async function packageTemplateSiteForHosting(site, options = {}) {
  if (!Array.isArray(site.pages) || site.pages.length === 0) {
    const error = new Error('This tailored site has no generated pages. Run RoxanneAI generation first.');
    error.status = 409;
    throw error;
  }

  const {
    siteName = '',
    slug = '',
    serviceType = 'static_site',
    plan = 'starter',
    environment = 'production',
    buildCommand = 'npm run build',
    publishDirectory = 'dist',
    branch = 'main',
    rootDirectory = '',
  } = options || {};
  const finalSiteName = siteName || site.answers?.businessName || site.templateId;
  const finalSlug = slugify(slug || finalSiteName || site.siteId);
  const generatedSite = await generateViteStaticSiteFromTemplateSite(site, {
    siteName: finalSiteName,
    slug: finalSlug,
    buildCommand,
    publishDirectory,
  });

  return {
    sourceType: 'roxanne-ai-template',
    status: 'ready_for_hosting',
    siteId: site.siteId,
    templateId: site.templateId,
    siteName: finalSiteName,
    slug: finalSlug,
    sourceArtifactId: generatedSite.siteDir,
    previewUrl: `/api/template-ai/sites/${site.siteId}/preview`,
    generatedSite,
    recommended: {
      serviceType,
      plan,
      environment,
      branch,
      rootDirectory,
      buildCommand: generatedSite.buildCommand,
      publishDirectory: generatedSite.publishDirectory,
    },
  };
}

function slugify(value) { return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'; }

export const templateAiController = { getSettings, startIntake, sendMessage, generateTailored, createSite, getSite, previewSite, packageSite, deploySite, getTemplatePreview };
