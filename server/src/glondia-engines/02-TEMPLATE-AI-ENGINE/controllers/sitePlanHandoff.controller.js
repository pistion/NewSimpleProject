// sitePlanHandoff.controller.js — Handoff controller for hybrid site plans
import { getSitePlan, updateSitePlan } from '../store/sitePlanStore.js';
import { buildGeneratedTemplateTargetRoot } from '../02-TEMPLATE-SOURCE-MOUNTAIN/templateGeneratedCopy.stage.js';
import { buildAnswerSheetFromPlan } from '../05-ANSWER-SHEET-MOUNTAIN/answerSheetBuilder.service.js';
import { completeAnswerSheetWithAi } from '../05-ANSWER-SHEET-MOUNTAIN/answerSheetAi.service.js';
import { validateAnswerSheet } from '../05-ANSWER-SHEET-MOUNTAIN/answerSheetValidator.service.js';
import { mapAnswerSheetToTemplateAnswers } from '../05-ANSWER-SHEET-MOUNTAIN/answerSheetMerge.service.js';

function err(msg, status = 400) { return Object.assign(new Error(msg), { status, expose: true }); }
function slugify(name) { return String(name || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'site'; }

function buildAnswersFromPlan(plan) {
  const wireframe = plan.wireframe || deriveWireframeFromSitemap(plan.sitemap);
  return {
    source: 'hybrid-site-plan',
    parentTemplateId: plan.templateId,
    templateType: plan.templateType,
    businessName: plan.brief?.businessName || '',
    industry: plan.brief?.industry || '',
    targetAudience: plan.brief?.targetAudience || '',
    offer: plan.brief?.offer || '',
    brandTone: plan.brief?.brandTone || '',
    colors: plan.brief?.colors || '',
    stylePreferences: plan.brief?.stylePreferences || '',
    pages: Array.isArray(plan.sitemap?.pages) ? plan.sitemap.pages.map(p => p.name).join(', ') : '',
    contact: plan.brief?.contact || '',
    domainPreference: plan.brief?.domainPreference || '',
    notes: plan.brief?.notes || '',
    sitemap: plan.sitemap || {},
    wireframe,
    style: plan.style || {},
  };
}

function deriveWireframeFromSitemap(sitemap = {}) {
  const pages = Array.isArray(sitemap?.pages) ? sitemap.pages : [];
  return {
    source: 'derived-from-sitemap',
    pages: pages.map((page) => ({
      id: page.id || null,
      name: page.name || '',
      path: page.path || '',
      sections: Array.isArray(page.sections)
        ? page.sections.map((section, index) => ({
          id: section.id || null,
          order: index + 1,
          title: section.title || '',
          type: section.type || '',
          description: section.description || '',
        }))
        : [],
    })),
  };
}

export const sitePlanHandoffController = {
  handoffPlan: async (req, res, next) => {
    try {
      const { planId } = req.params;
      const plan = await getSitePlan(planId);
      if (!plan) throw err('Plan not found.', 404);
      if (!canAccessPlan(req.user, plan)) throw err('You do not have access to this site plan.', 403);

      // ── Answer sheet layer ────────────────────────────────────────────────
      const {
        answerSheet,
        validation,
        status: answerSheetStatus,
        aiAttempted,
        aiError,
      } = await getOrCreateUsableAnswerSheet(plan, {
        allowAiCompletion: req.body?.allowAiCompletion !== false,
      });

      if (!validation.valid) {
        return res.status(422).json({
          error: 'Answer sheet is incomplete. Review required before handoff.',
          code: 'ANSWER_SHEET_INCOMPLETE',
          missing: validation.missing,
          warnings: validation.warnings,
          answerSheet,
          answerSheetStatus,
          aiAttempted,
          aiError: aiError ? aiError.message : null,
          planId,
        });
      }

      const answers = mapAnswerSheetToTemplateAnswers(answerSheet);
      const siteName = answers.businessName || answerSheet.business?.name || plan.sitemap?.name || plan.templateId || 'glondia-site';
      const slug = slugify(siteName);
      const ownerUserId = plan.userId || plan.ownerUserId || req.user?.id || 'anonymous';

      // Dynamically import to avoid circular dep at startup
      let createTemplateSite, updateTemplateSite;
      try {
        const store = await import('../store/templateSiteStore.js');
        createTemplateSite = store.createTemplateSite;
        updateTemplateSite = store.updateTemplateSite;
      } catch {
        throw err('Template site store not available.', 503);
      }

      let prepareTemplateGeneratedSource;
      try {
        const src = await import('../02-TEMPLATE-SOURCE-MOUNTAIN/templateSource.stage.js');
        prepareTemplateGeneratedSource = src.prepareTemplateGeneratedSource || src.default?.prepareTemplateGeneratedSource;
      } catch {
        throw err('Template source stage not available.', 503);
      }

      let runGeneratedSiteToRender;
      try {
        const pipe = await import('../../01-HOSTING-DEPLOY-ENGINE/pipelines/generatedSiteToRender.pipeline.js');
        runGeneratedSiteToRender = pipe.run || pipe.default?.run;
      } catch {
        throw err('Hosting deploy pipeline not available.', 503);
      }

      const site = await createTemplateSite({
        templateId: plan.templateId,
        answers: { ...answers, userId: ownerUserId },
        tailoredPages: [],
        userId: ownerUserId,
        ownerUserId,
      });
      const rootDirectory = buildGeneratedTemplateTargetRoot({ userId: ownerUserId, siteId: site.siteId, slug });

      const generatedSite = await prepareTemplateGeneratedSource(
        { ...site, answers: { ...answers, userId: ownerUserId }, siteName, slug },
        { answers: { ...answers, userId: ownerUserId }, userId: ownerUserId, siteName, slug, sitemap: plan.sitemap, wireframe: plan.wireframe, style: plan.style }
      );

      await updateTemplateSite(site.siteId, {
        answers, siteName, slug, status: 'prepared',
        generatedSite, pages: generatedSite?.pages || [],
        templateMetadata: generatedSite?.templateMetadata,
      });

      const deployment = await runGeneratedSiteToRender({
        siteId: site.siteId,
        templateId: plan.templateId,
        siteName, slug, generatedSite,
        source: 'hybrid-site-builder',
        sourceReference: planId,
        rootDirectory,
        buildCommand: generatedSite?.buildCommand,
        publishDirectory: generatedSite?.publishDirectory,
        framework: generatedSite?.framework,
      }, { userId: ownerUserId });

      await updateSitePlan(planId, {
        status: 'handed_off',
        siteId: site.siteId,
        deploymentId: deployment?.deploymentId,
        generatedAt: new Date().toISOString(),
        handedOffAt: new Date().toISOString(),
      });

      res.json({
        planId,
        siteId: site.siteId,
        deploymentId: deployment?.deploymentId,
        status: deployment?.status,
        buildStatus: deployment?.buildStatus,
        liveUrl: deployment?.liveUrl,
        currentStep: deployment?.currentStep,
        answerSheetStatus,
        answerSheetWarnings: validation.warnings || [],
        aiAttempted,
      });
    } catch (e) { next(e); }
  },
};

async function getOrCreateUsableAnswerSheet(plan, options = {}) {
  const now = new Date().toISOString();

  let answerSheet = plan.answerSheet || buildAnswerSheetFromPlan(plan);
  let validation = validateAnswerSheet(answerSheet);
  let status = plan.answerSheet ? (plan.answerSheetStatus || 'draft') : 'built';
  let aiAttempted = false;
  let aiError = null;

  // If incomplete, try AI completion once — unless explicitly disabled.
  if (!validation.valid && options.allowAiCompletion !== false) {
    aiAttempted = true;
    try {
      answerSheet = await completeAnswerSheetWithAi(answerSheet, {
        reason: 'handoff_auto_completion',
        planId: plan.planId,
      });
      validation = validateAnswerSheet(answerSheet);
      status = validation.valid
        ? (validation.warnings?.length ? 'needs_review' : 'ready')
        : 'incomplete';
    } catch (error) {
      aiError = error;
      const warnings = Array.isArray(answerSheet.meta?.warnings) ? answerSheet.meta.warnings : [];
      answerSheet = {
        ...answerSheet,
        meta: {
          ...(answerSheet.meta || {}),
          warnings: [...warnings, `AI handoff completion failed: ${error.message}`],
          updatedAt: now,
        },
      };
      validation = validateAnswerSheet(answerSheet);
      status = validation.valid
        ? (validation.warnings?.length ? 'needs_review' : 'ready')
        : 'incomplete';
    }
  } else {
    status = validation.valid
      ? (validation.warnings?.length ? 'needs_review' : 'ready')
      : 'incomplete';
  }

  await updateSitePlan(plan.planId, {
    answerSheet,
    answerSheetStatus: status,
    answerSheetUpdatedAt: now,
    answerSheetAutoCompletedAt: aiAttempted ? now : (plan.answerSheetAutoCompletedAt || null),
    answerSheetAiError: aiError ? aiError.message : null,
  });

  return { answerSheet, validation, status, aiAttempted, aiError };
}

function canAccessPlan(user, plan) {
  if (user?.role === 'admin') return true;
  const owner = plan.userId || plan.ownerUserId || null;
  return Boolean(user?.id && owner && user.id === owner);
}
