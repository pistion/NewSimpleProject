/*
 * template-ai.controller.js
 * Handles AI-assisted template intake, HTML tailoring, draft persistence, and generated-site deployment records.
 */

import { tailorHtmlTemplate, INTAKE_QUESTIONS, REQUIRED_KEYS } from '../services/openaiSiteAssistant.service.js';
import { makeId, nowIso, mutateHostingStore } from '../services/hostingStore.js';
import {
  createTemplateSite,
  getTemplateSite,
  updateTemplateSite,
} from '../services/templateSiteStore.js';
import { generateViteStaticSiteFromTemplateSite } from '../services/staticSiteGenerator.service.js';

const sessions = new Map();

function maybeCleanSessions() {
  if (sessions.size < 500) return;
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, s] of sessions) {
    if (new Date(s.createdAt).getTime() < cutoff) sessions.delete(id);
  }
}

async function startIntake(req, res, next) {
  try {
    const { templateId } = req.body || {};
    if (!templateId || typeof templateId !== 'string') return res.status(400).json({ error: 'templateId is required.' });
    if (templateId.length > 100) return res.status(400).json({ error: 'templateId is too long.' });

    maybeCleanSessions();
    const sessionId = makeId('intake');
    sessions.set(sessionId, {
      templateId,
      collectedAnswers: {},
      step: 0,
      createdAt: new Date().toISOString(),
    });

    const q = INTAKE_QUESTIONS[0];
    res.json({
      sessionId,
      question: q.question,
      questionKey: q.key,
      questionLabel: q.label,
      step: 0,
      totalSteps: INTAKE_QUESTIONS.length,
      requiredFields: REQUIRED_KEYS,
      collectedAnswers: {},
    });
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
    if (currentQ) {
      const value = message.trim().toLowerCase() === 'skip' ? '' : message.trim();
      session.collectedAnswers[currentQ.key] = value;
    }

    if (collectedAnswers && typeof collectedAnswers === 'object') {
      for (const [k, v] of Object.entries(collectedAnswers)) {
        if (typeof k === 'string' && k.length < 60 && typeof v === 'string' && v.length < 2000) {
          session.collectedAnswers[k] = session.collectedAnswers[k] ?? v;
        }
      }
    }

    session.step += 1;
    const nextQ = INTAKE_QUESTIONS[session.step];
    const complete = !nextQ;

    res.json({
      sessionId,
      question: nextQ?.question || null,
      questionKey: nextQ?.key || null,
      questionLabel: nextQ?.label || null,
      step: session.step,
      totalSteps: INTAKE_QUESTIONS.length,
      collectedAnswers: { ...session.collectedAnswers },
      complete,
    });
  } catch (err) { next(err); }
}

async function generateTailored(req, res, next) {
  try {
    const { templateId, templateHtml, answers } = req.body || {};

    if (!templateId || typeof templateId !== 'string') return res.status(400).json({ error: 'templateId is required.' });
    if (!templateHtml || typeof templateHtml !== 'string') return res.status(400).json({ error: 'templateHtml (string) is required.' });
    if (templateHtml.length > 200_000) return res.status(400).json({ error: 'templateHtml exceeds 200 kB limit.' });
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return res.status(400).json({ error: 'answers (object) is required.' });

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: 'AI tailoring is not available. OPENAI_API_KEY is not configured on this server.',
        code: 'OPENAI_NOT_CONFIGURED',
      });
    }

    const tailored = await tailorHtmlTemplate(templateHtml, answers);

    res.json({
      templateId,
      summary: `Tailored for ${answers.businessName || 'your business'}`,
      answers,
      pages: [{ title: 'Home', path: '/', html: tailored }],
    });
  } catch (err) { next(err); }
}

async function createSite(req, res, next) {
  try {
    const { templateId, answers, tailoredPages } = req.body || {};

    if (!templateId || typeof templateId !== 'string') return res.status(400).json({ error: 'templateId is required.' });
    if (templateId.length > 100) return res.status(400).json({ error: 'templateId is too long.' });
    if (answers !== undefined && (typeof answers !== 'object' || Array.isArray(answers))) return res.status(400).json({ error: 'answers must be an object.' });
    if (tailoredPages !== undefined && !Array.isArray(tailoredPages)) return res.status(400).json({ error: 'tailoredPages must be an array.' });

    const site = await createTemplateSite({
      templateId,
      answers: answers || {},
      tailoredPages: tailoredPages || [],
    });

    res.status(201).json({
      siteId: site.siteId,
      templateId: site.templateId,
      answers: site.answers,
      pages: site.pages,
      status: site.status,
      createdAt: site.createdAt,
    });
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

async function deploySite(req, res, next) {
  try {
    const { siteId } = req.params;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });

    const site = await getTemplateSite(siteId);
    if (!site) return res.status(404).json({ error: `Site "${siteId}" not found. Complete the AI intake to create it.` });
    if (!Array.isArray(site.pages) || site.pages.length === 0) {
      return res.status(409).json({ error: 'This tailored site has no generated pages. Run RoxanneAI generation first.' });
    }

    const {
      siteName = '',
      slug = '',
      serviceType = 'static_site',
      plan = 'starter',
      environment = 'production',
      buildCommand = 'npm install && npm run build',
      publishDirectory = 'dist',
      sourceReference = 'roxanne-ai-tailored-template',
    } = req.body || {};

    const deploymentId = makeId('dep');
    const renderServiceId = makeId('render_svc');
    const renderDeployId = makeId('render_deploy');
    const now = nowIso();
    const finalSiteName = siteName || site.answers?.businessName || site.templateId;
    const finalSlug = slugify(slug || finalSiteName || siteId);

    const generatedSite = await generateViteStaticSiteFromTemplateSite(site, {
      siteName: finalSiteName,
      slug: finalSlug,
      buildCommand,
      publishDirectory,
    });

    await mutateHostingStore((store) => {
      store.deployments.unshift({
        id: deploymentId,
        deploymentId,
        siteId,
        templateId: site.templateId,
        serviceName: finalSlug,
        siteName: finalSiteName,
        serviceType,
        plan,
        provider: 'render',
        providerStatus: 'prepared',
        status: 'building',
        buildStatus: 'queued',
        currentStep: 'Generated Vite site prepared',
        source: 'ai-tailored-template',
        sourceReference,
        renderServiceId,
        renderDeployId,
        liveUrl: `https://${finalSlug}.onrender.com`,
        verifiedUrl: null,
        urlReachable: false,
        errorMessage: null,
        deploymentLogsReference: deploymentId,
        generatedSite,
        environmentConfiguration: {
          environment,
          branch: 'main',
          rootDirectory: generatedSite.siteDir,
          buildCommand: generatedSite.buildCommand,
          outputDirectory: generatedSite.publishDirectory,
          framework: generatedSite.framework,
        },
        environmentVariablesMetadata: [],
        diskMetadata: [],
        domainMetadata: [],
        createdAt: now,
        updatedAt: now,
        lastDeployedAt: null,
      });

      store.logs[deploymentId] = [
        makeLog('Deployment session created from RoxanneAI tailored template.', 'info'),
        makeLog(`Generated Vite React static site files in ${generatedSite.siteDir}.`, 'ok'),
        makeLog(`Build command prepared: ${generatedSite.buildCommand}.`, 'info'),
        makeLog(`Publish directory prepared: ${generatedSite.publishDirectory}.`, 'info'),
        makeLog('Render deployment handoff record created. Provider API handoff is the next production integration step.', 'warn'),
      ];
    });

    await updateTemplateSite(siteId, {
      status: 'deploying',
      deploymentId,
      generatedSite,
      deploymentSettings: {
        siteName: finalSiteName,
        slug: finalSlug,
        serviceType,
        plan,
        environment,
        buildCommand,
        publishDirectory,
      },
    });

    res.json({
      status: 'deploying',
      siteId,
      deploymentId,
      templateId: site.templateId,
      generatedSite,
      message: 'Generated Vite React static site files and created the Hosting deployment record.',
    });
  } catch (err) { next(err); }
}

async function getTemplatePreview(req, res, next) {
  try {
    const { templateId } = req.params;
    if (!templateId) return res.status(400).json({ error: 'templateId is required.' });

    res.json({
      templateId,
      previewAvailable: false,
      previewType: 'client-side-srcDoc',
      note: 'Template HTML is bundled in the frontend. Use contentJson.pages[0].html from the GD.templates array for iframe preview via srcDoc.',
    });
  } catch (err) { next(err); }
}

function makeLog(message, level = 'info') {
  return { id: makeId('log'), level, message, timestamp: nowIso(), createdAt: nowIso() };
}

function slugify(value) {
  return String(value || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'site';
}

export const templateAiController = {
  startIntake,
  sendMessage,
  generateTailored,
  createSite,
  getSite,
  deploySite,
  getTemplatePreview,
};
