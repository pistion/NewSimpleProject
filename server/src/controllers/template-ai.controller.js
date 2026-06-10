/*
 * template-ai.controller.js
 * Handles AI-assisted template intake, HTML tailoring, draft persistence, and Hosting handoff packaging.
 */

import { tailorHtmlTemplate, INTAKE_QUESTIONS, REQUIRED_KEYS } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/04-AI-REFINEMENT-MOUNTAIN/openaiTailor.stage.js';
import { makeId } from '../services/hostingStore.js';
import { createTemplateSite, getTemplateSite, updateTemplateSite } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/store/templateSiteStore.js';
import { getTemplateDetails, listTemplateCatalog } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/01-TEMPLATE-LIBRARY-MOUNTAIN/templateSelection.stage.js';
import { applyQuestionnaireDataToGeneratedSource, prepareTemplateGeneratedSource } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/02-TEMPLATE-SOURCE-MOUNTAIN/templateSource.stage.js';
import { mapAnswerSheetToTemplateAnswers, mergeAnswerSheetIntoAnswers } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/05-ANSWER-SHEET-MOUNTAIN/answerSheetMerge.service.js';
import { buildGeneratedTemplateTargetRoot } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/02-TEMPLATE-SOURCE-MOUNTAIN/templateGeneratedCopy.stage.js';
import { generateViteStaticSiteFromTemplateSite } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/07-HANDOFF-TO-HOSTING-MOUNTAIN/finalSourcePackager.stage.js';
import { scanGeneratedTemplateSite } from '../glondia-engines/02-TEMPLATE-AI-ENGINE/07-HANDOFF-TO-HOSTING-MOUNTAIN/generatedTemplateSiteScanner.stage.js';
import { run as runGeneratedSiteToRender } from '../glondia-engines/01-HOSTING-DEPLOY-ENGINE/pipelines/generatedSiteToRender.pipeline.js';
import renderApiService from '../services/renderApiService.js';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const sessions = new Map();

function maybeCleanSessions() {
  if (sessions.size < 500) return;
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of sessions) if (new Date(s.createdAt).getTime() < cutoff) sessions.delete(id);
}

async function getSettings(req, res, next) {
  try {
    const sourceRepoConfigured = Boolean((process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL || '').trim());
    const templateRepo = process.env.TEMPLATE_LIBRARY_REPO_URL || process.env.RENDER_GENERATED_SITES_REPO_URL || 'https://github.com/pistion/glondia-generated-sites.git';
    const renderConfigured = renderApiService.configured();
    const openAiConfigured = Boolean(process.env.OPENAI_API_KEY);
    res.json({
      openAiConfigured,
      renderConfigured,
      sourceRepoConfigured,
      sourceRepo: process.env.RENDER_GENERATED_SITES_REPO_URL || null,
      templateRepo,
      templateRoot: process.env.TEMPLATE_LIBRARY_ROOT || 'templates',
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

async function listTemplates(req, res, next) {
  try {
    res.json(await listTemplateCatalog());
  } catch (err) { next(err); }
}

async function getTemplate(req, res, next) {
  try {
    const { templateId } = req.params;
    res.json(await getTemplateDetails(templateId));
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
    const { templateId, answers, tailoredPages, siteName, slug } = req.body || {};
    if (!templateId || typeof templateId !== 'string') return res.status(400).json({ error: 'templateId is required.' });
    if (templateId.length > 100) return res.status(400).json({ error: 'templateId is too long.' });
    if (answers !== undefined && (typeof answers !== 'object' || Array.isArray(answers))) return res.status(400).json({ error: 'answers must be an object.' });
    if (tailoredPages !== undefined && !Array.isArray(tailoredPages)) return res.status(400).json({ error: 'tailoredPages must be an array.' });
    const ownerUserId = req.user?.id || null;
    const site = await createTemplateSite({
      templateId,
      answers: { ...(answers || {}), userId: ownerUserId },
      tailoredPages: tailoredPages || [],
      userId: ownerUserId,
      ownerUserId,
    });
    const updates = {};
    if (siteName) updates.siteName = String(siteName).slice(0, 140);
    if (slug) updates.slug = slugify(slug);
    const finalSite = Object.keys(updates).length ? await updateTemplateSite(site.siteId, updates) : site;
    res.status(201).json({ siteId: finalSite.siteId, templateId: finalSite.templateId, answers: finalSite.answers, pages: finalSite.pages, status: finalSite.status, siteName: finalSite.siteName, slug: finalSite.slug, createdAt: finalSite.createdAt });
  } catch (err) { next(err); }
}

async function getSite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });
    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found.` });
    if (!canAccessTemplateSite(req.user, site)) return res.status(403).json({ error: 'You do not have access to this template site.' });
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
    if (!activePage?.html && site.generatedSite?.siteDir) {
      const indexPath = join(site.generatedSite.siteDir, 'index.html');
      if (existsSync(indexPath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(await readFile(indexPath, 'utf8'));
      }
    }
    if (!activePage?.html) return res.status(404).send('<!doctype html><html><body><h1>No generated preview available</h1></body></html>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(activePage.html);
  } catch (err) { next(err); }
}

async function prepareSite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });
    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found.` });
    if (!canAccessTemplateSite(req.user, site)) return res.status(403).json({ error: 'You do not have access to this template site.' });
    const mergedAnswers = { ...(site.answers || {}), ...(req.body?.answers || {}) };
    const siteForPrepare = { ...site, answers: mergedAnswers };
    const generatedSite = await prepareTemplateGeneratedSource(siteForPrepare, { ...(req.body || {}), userId: site.userId || req.user?.id });
    const updated = await updateTemplateSite(siteId, {
      answers: mergedAnswers,
      siteName: req.body?.siteName || site.siteName || generatedSite.siteProfile?.siteName,
      slug: req.body?.slug ? slugify(req.body.slug) : (site.slug || generatedSite.siteProfile?.slug),
      pages: generatedSite.pages || site.pages || [],
      status: 'prepared',
      generatedSite,
      templateMetadata: generatedSite.templateMetadata,
    });
    res.json(updated);
  } catch (err) { next(err); }
}

async function aiEditSite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });
    let site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found.` });
    if (!canAccessTemplateSite(req.user, site)) return res.status(403).json({ error: 'You do not have access to this template site.' });
    if (!site.generatedSite?.siteDir) {
      const generatedSite = await prepareTemplateGeneratedSource(site, { ...(req.body || {}), userId: site.userId || req.user?.id });
      site = await updateTemplateSite(siteId, { status: 'prepared', generatedSite, pages: generatedSite.pages || [] });
    }

    const indexPath = join(site.generatedSite.siteDir, 'index.html');
    if (!existsSync(indexPath)) {
      return res.status(409).json({ error: 'AI edit currently requires an index.html file in the prepared template copy.', code: 'TEMPLATE_AI_INDEX_REQUIRED' });
    }

    // Merge answer sheets — answer-sheet fields take precedence over weak flat values
    let answers = { ...(site.answers || {}), ...(req.body?.answers || {}) };
    if (req.body?.answerSheet && typeof req.body.answerSheet === 'object') {
      answers = mergeAnswerSheetIntoAnswers(answers, req.body.answerSheet);
    } else if (answers.answerSheet && typeof answers.answerSheet === 'object') {
      answers = mergeAnswerSheetIntoAnswers(answers, answers.answerSheet);
    }

    // Default: use applyQuestionnaireDataToGeneratedSource (safer, answer-sheet aware).
    // Raw HTML tailoring only runs when explicitly requested.
    const original = await readFile(indexPath, 'utf8');
    let editedHtml = original;
    if (req.body?.allowRawHtmlAiEdit === true) {
      editedHtml = await tailorHtmlTemplate(original, answers);
      await writeFile(indexPath, editedHtml, 'utf8');
    }
    await applyQuestionnaireDataToGeneratedSource(site.generatedSite.siteDir, answers, {
      site,
      template: site.templateMetadata || site.generatedSite.templateMetadata || {},
      slug: site.slug || answers.slug,
      targetRoot: site.generatedSite.githubTargetRoot || buildGeneratedTemplateTargetRoot({ userId: site.userId || req.user?.id, siteId, slug: site.slug || answers.slug || answers.businessName }),
      sourceReference: `templates/${site.templateId}`,
    });
    const scan = await scanGeneratedTemplateSite(site.generatedSite.siteDir, {
      siteId,
      siteName: site.siteName || answers.siteName || answers.businessName,
      slug: site.slug || answers.slug || answers.businessName,
      templateId: site.templateId,
      framework: site.generatedSite.framework,
      packageManager: site.generatedSite.packageManager,
      buildCommand: site.generatedSite.buildCommand,
      publishDirectory: site.generatedSite.publishDirectory,
      rootDirectory: site.generatedSite.githubTargetRoot || buildGeneratedTemplateTargetRoot({ userId: site.userId || req.user?.id, siteId, slug: site.slug || answers.slug || answers.businessName }),
      repoUrl: req.body?.repoUrl || req.body?.repositoryUrl || process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL || 'https://github.com/pistion/glondia-generated-sites.git',
      branch: req.body?.branch || 'main',
    });

    // editedHtml is already set above (original, or AI-tailored when allowRawHtmlAiEdit===true)
    const updated = await updateTemplateSite(siteId, {
      answers,
      status: 'ai_edited',
      pages: [{ title: 'Home', path: '/', html: editedHtml }],
      generatedSite: {
        ...site.generatedSite,
        pages: [{ title: 'Home', path: '/', html: editedHtml }],
        scan,
        files: Array.from(new Set([...(site.generatedSite.files || []), ...(scan.manifestFiles || [])])),
        aiEdit: {
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          changedFiles: ['index.html'],
          editedAt: new Date().toISOString(),
        },
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
}

async function packageSite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });
    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found. Complete the AI intake to create it.` });
    if (!canAccessTemplateSite(req.user, site)) return res.status(403).json({ error: 'You do not have access to this template site.' });
    const handoff = await packageTemplateSiteForHosting(site, { ...(req.body || {}), userId: site.userId || req.user?.id });
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
    if (!canAccessTemplateSite(req.user, site)) return res.status(403).json({ error: 'You do not have access to this template site.' });

    const handoff = await packageTemplateSiteForHosting(site, { ...(req.body || {}), userId: site.userId || req.user?.id });
    const deployment = await runGeneratedSiteToRender({
      ...(req.body || {}),
      ...handoff,
      generatedSite: handoff.generatedSite,
      siteName: handoff.siteName,
      slug: handoff.slug,
      source: 'template',
      sourceReference: `templates/${site.templateId}`,
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
  const ownerUserId = options.userId || site.userId || site.ownerUserId || site.answers?.userId || 'anonymous';
  const templateTargetRoot = buildGeneratedTemplateTargetRoot({ userId: ownerUserId, siteId: site.siteId, slug: finalSlug });
  let generatedSite = site.generatedSite;
  if (!generatedSite?.siteDir) {
    if (Array.isArray(site.pages) && site.pages.length > 0) {
      generatedSite = await generateViteStaticSiteFromTemplateSite(site, {
        siteName: finalSiteName,
        slug: finalSlug,
        buildCommand,
        publishDirectory,
      });
    } else {
      generatedSite = await prepareTemplateGeneratedSource(site, { ...options, userId: ownerUserId, siteName: finalSiteName, slug: finalSlug });
    }
  }
  const scan = generatedSite?.siteDir
    ? await scanGeneratedTemplateSite(generatedSite.siteDir, {
      siteId: site.siteId,
      userId: ownerUserId,
      siteName: finalSiteName,
      slug: finalSlug,
      templateId: site.templateId,
      framework: generatedSite.framework,
      packageManager: generatedSite.packageManager,
      buildCommand: generatedSite.buildCommand || buildCommand,
      publishDirectory: generatedSite.publishDirectory || publishDirectory,
      rootDirectory: rootDirectory || templateTargetRoot,
      repoUrl: options.repoUrl || options.repositoryUrl || process.env.RENDER_GENERATED_SITES_REPO_URL || process.env.GENERATED_SITES_REPO_URL || 'https://github.com/pistion/glondia-generated-sites.git',
      branch,
    })
    : null;
  if (scan) {
    generatedSite = {
      ...generatedSite,
      scan,
      githubTargetRoot: rootDirectory || templateTargetRoot,
      files: Array.from(new Set([...(generatedSite.files || []), ...(scan.manifestFiles || [])])),
    };
  }

  return {
    sourceType: generatedSite.sourceType || 'template',
    status: 'ready_for_hosting',
    siteId: site.siteId,
    templateId: site.templateId,
    siteName: finalSiteName,
    slug: finalSlug,
    branch,
    rootDirectory: rootDirectory || templateTargetRoot,
    buildCommand: generatedSite.buildCommand || buildCommand,
    publishDirectory: generatedSite.publishDirectory || publishDirectory,
    sourceArtifactId: generatedSite.siteDir,
    previewUrl: `/api/template-ai/sites/${site.siteId}/preview`,
    generatedSite,
    recommended: {
      serviceType,
      plan,
      environment,
      branch,
      rootDirectory: rootDirectory || templateTargetRoot,
      buildCommand: generatedSite.buildCommand || buildCommand,
      publishDirectory: generatedSite.publishDirectory || publishDirectory,
    },
  };
}

function slugify(value) { return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'; }

function canAccessTemplateSite(user, site) {
  if (user?.role === 'admin') return true;
  const owner = site?.userId || site?.ownerUserId || site?.answers?.userId || null;
  return Boolean(user?.id && owner && user.id === owner);
}

export const templateAiController = { getSettings, listTemplates, getTemplate, startIntake, sendMessage, generateTailored, createSite, getSite, previewSite, prepareSite, aiEditSite, packageSite, deploySite, getTemplatePreview };
