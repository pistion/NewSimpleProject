/*
 * template-ai.controller.js
 * Handles AI-assisted template intake, HTML tailoring, draft persistence, generated GitHub publishing, and Render deployment records.
 */

import { tailorHtmlTemplate, INTAKE_QUESTIONS, REQUIRED_KEYS } from '../services/openaiSiteAssistant.service.js';
import { makeId, nowIso, mutateHostingStore } from '../services/hostingStore.js';
import { createTemplateSite, getTemplateSite, updateTemplateSite } from '../services/templateSiteStore.js';
import { generateViteStaticSiteFromTemplateSite } from '../services/staticSiteGenerator.service.js';
import renderApiService from '../services/renderApiService.js';
import { publishGeneratedSiteToGitHub } from '../services/githubGeneratedSitePublisher.service.js';

const sessions = new Map();

function maybeCleanSessions() {
  if (sessions.size < 500) return;
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of sessions) if (new Date(s.createdAt).getTime() < cutoff) sessions.delete(id);
}

async function getSettings(req, res, next) {
  try {
    const sourceRepoConfigured = Boolean(process.env.RENDER_GENERATED_SITES_REPO_URL);
    const githubTokenConfigured = Boolean(process.env.GITHUB_GENERATED_SITES_TOKEN || process.env.GITHUB_TOKEN);
    const renderConfigured = renderApiService.configured();
    const openAiConfigured = Boolean(process.env.OPENAI_API_KEY);
    res.json({
      openAiConfigured,
      githubPublisherConfigured: sourceRepoConfigured && githubTokenConfigured,
      renderConfigured,
      sourceRepoConfigured,
      sourceRepo: process.env.RENDER_GENERATED_SITES_REPO_URL || null,
      defaultRootDirectory: process.env.RENDER_GENERATED_SITES_ROOT_DIR || null,
      missing: [
        !openAiConfigured ? 'OPENAI_API_KEY' : null,
        !githubTokenConfigured ? 'GITHUB_GENERATED_SITES_TOKEN' : null,
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

async function deploySite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });
    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found. Complete the AI intake to create it.` });
    if (!Array.isArray(site.pages) || site.pages.length === 0) return res.status(409).json({ error: 'This tailored site has no generated pages. Run RoxanneAI generation first.' });

    const { siteName = '', slug = '', serviceType = 'static_site', plan = 'starter', environment = 'production', buildCommand = 'npm run build', publishDirectory = 'dist', sourceReference = 'roxanne-ai-tailored-template', repoUrl = '', repositoryUrl = '', branch = 'main', rootDirectory = '' } = req.body || {};
    const deploymentId = makeId('dep');
    const now = nowIso();
    const finalSiteName = siteName || site.answers?.businessName || site.templateId;
    const finalSlug = slugify(slug || finalSiteName || siteId);
    const generatedSite = await generateViteStaticSiteFromTemplateSite(site, { siteName: finalSiteName, slug: finalSlug, buildCommand, publishDirectory });
    const sourceRepo = repoUrl || repositoryUrl || process.env.RENDER_GENERATED_SITES_REPO_URL || '';
    const targetRoot = rootDirectory || process.env.RENDER_GENERATED_SITES_ROOT_DIR || `generated-sites/${finalSlug}`;
    const githubPublish = await publishGeneratedSiteToGitHub({ siteDir: generatedSite.siteDir, repoUrl: sourceRepo, branch, targetRoot, commitMessage: `Publish RoxanneAI generated site ${finalSlug}` });
    const renderSourceRepo = sourceRepo;
    const renderRootDirectory = githubPublish.attempted && !githubPublish.errors?.length ? targetRoot : (rootDirectory || process.env.RENDER_GENERATED_SITES_ROOT_DIR || '');
    let renderServiceId = makeId('render_svc_pending');
    let renderDeployId = makeId('render_deploy_pending');
    let render = { configured: renderApiService.configured(), attempted: false, skippedReason: null, serviceResponse: null, deployResponse: null, githubPublish };
    let providerStatus = 'prepared';
    let status = 'prepared';
    let buildStatus = 'generated';
    let currentStep = githubPublish.attempted ? 'Generated site published to GitHub' : 'Generated Vite site prepared';
    let liveUrl = `https://${finalSlug}.onrender.com`;
    let errorMessage = null;

    if (!renderSourceRepo) render.skippedReason = 'No GitHub/Render source repository configured. Set RENDER_GENERATED_SITES_REPO_URL or send repoUrl in the deploy request.';
    else if (!githubPublish.attempted) render.skippedReason = githubPublish.skippedReason || 'Generated site files were not published to GitHub.';
    else if (githubPublish.errors?.length) render.skippedReason = `Generated site GitHub publish completed with ${githubPublish.errors.length} errors. Fix GitHub publishing before Render handoff.`;
    else if (!renderApiService.configured()) render.skippedReason = 'Render API credentials are missing. Set RENDER_API_KEY and RENDER_OWNER_ID.';
    else {
      try {
        render.attempted = true;
        const serviceResponse = await renderApiService.createService({ serviceName: finalSlug, serviceType, plan, repoUrl: renderSourceRepo, branch, rootDirectory: renderRootDirectory, buildCommand, outputDirectory: publishDirectory, sourceReference: renderSourceRepo });
        renderServiceId = serviceResponse?.service?.id || serviceResponse?.id || renderServiceId;
        const deployResponse = await renderApiService.triggerDeploy(renderServiceId, { deployMode: 'build_and_deploy' });
        renderDeployId = deployResponse?.deploy?.id || deployResponse?.id || renderDeployId;
        providerStatus = deployResponse?.deploy?.status || deployResponse?.status || 'accepted';
        status = renderDeployId ? 'building' : 'preparing';
        buildStatus = renderDeployId ? 'queued' : 'accepted';
        currentStep = renderDeployId ? 'Queued in Render' : 'Sent to Render';
        liveUrl = serviceResponse?.service?.serviceDetails?.url || serviceResponse?.service?.url || serviceResponse?.url || liveUrl;
        render.serviceResponse = serviceResponse;
        render.deployResponse = deployResponse;
      } catch (error) {
        providerStatus = 'handoff_failed'; status = 'deployed_unverified'; buildStatus = 'generated'; currentStep = 'Generated and published; Render handoff failed'; errorMessage = error.message || 'Render handoff failed.';
        render.error = { message: error.message, status: error.status, details: error.details || null };
      }
    }

    await mutateHostingStore((store) => {
      store.deployments.unshift({ id: deploymentId, deploymentId, siteId, templateId: site.templateId, serviceName: finalSlug, siteName: finalSiteName, serviceType, plan, provider: 'render', providerStatus, status, buildStatus, currentStep, source: 'ai-tailored-template', sourceReference, renderServiceId, renderDeployId, liveUrl, verifiedUrl: null, urlReachable: false, errorMessage, deploymentLogsReference: deploymentId, generatedSite, render, environmentConfiguration: { environment, branch, rootDirectory: renderRootDirectory || generatedSite.siteDir, buildCommand: generatedSite.buildCommand, outputDirectory: generatedSite.publishDirectory, framework: generatedSite.framework, sourceRepository: renderSourceRepo || null }, environmentVariablesMetadata: [], diskMetadata: [], domainMetadata: [], createdAt: now, updatedAt: now, lastDeployedAt: null });
      const logs = [makeLog('Deployment session created from RoxanneAI tailored template.', 'info'), makeLog(`Generated Vite React static site files in ${generatedSite.siteDir}.`, 'ok'), makeLog(`Build command prepared: ${generatedSite.buildCommand}.`, 'info'), makeLog(`Publish directory prepared: ${generatedSite.publishDirectory}.`, 'info')];
      if (githubPublish.attempted) logs.push(makeLog(`Published ${githubPublish.publishedCount || 0} generated files to GitHub repo ${githubPublish.repository} at ${githubPublish.targetRoot || '(root)'}.`, githubPublish.errors?.length ? 'warn' : 'ok'));
      if (!githubPublish.attempted) logs.push(makeLog(githubPublish.skippedReason || 'GitHub publish skipped.', 'warn'));
      if (githubPublish.errors?.length) logs.push(makeLog(`GitHub publish errors: ${githubPublish.errors.map(e => `${e.path}: ${e.message}`).join('; ')}`, 'warn'));
      if (render.attempted && !errorMessage) logs.push(makeLog(`Render deploy ${renderDeployId} started for ${finalSlug}.`, 'ok'));
      if (render.attempted && errorMessage) logs.push(makeLog(`Render handoff failed: ${errorMessage}`, 'warn'));
      if (!render.attempted) logs.push(makeLog(render.skippedReason || 'Render handoff skipped.', 'warn'));
      store.logs[deploymentId] = logs;
    });
    await updateTemplateSite(siteId, { status, deploymentId, generatedSite, render, deploymentSettings: { siteName: finalSiteName, slug: finalSlug, serviceType, plan, environment, buildCommand, publishDirectory, repoUrl: renderSourceRepo || null, rootDirectory: renderRootDirectory || null } });
    res.json({ status, siteId, deploymentId, templateId: site.templateId, generatedSite, render, liveUrl, message: render.attempted && !errorMessage ? 'Generated site, published to GitHub, and started Render deployment.' : 'Generated site and created Hosting record. Check Hosting logs for GitHub/Render configuration status.' });
  } catch (err) { next(err); }
}

async function getTemplatePreview(req, res, next) {
  try {
    const { templateId } = req.params;
    if (!templateId) return res.status(400).json({ error: 'templateId is required.' });
    res.json({ templateId, previewAvailable: false, previewType: 'client-side-srcDoc', note: 'Template HTML is bundled in the frontend. Use contentJson.pages[0].html from the GD.templates array for iframe preview via srcDoc.' });
  } catch (err) { next(err); }
}

function makeLog(message, level = 'info') { return { id: makeId('log'), level, message, timestamp: nowIso(), createdAt: nowIso() }; }
function slugify(value) { return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site'; }

export const templateAiController = { getSettings, startIntake, sendMessage, generateTailored, createSite, getSite, previewSite, deploySite, getTemplatePreview };
