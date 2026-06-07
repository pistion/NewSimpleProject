// sitePlanHandoff.controller.js — Handoff controller for hybrid site plans
import { getSitePlan, updateSitePlan } from '../store/sitePlanStore.js';

function err(msg, status = 400) { return Object.assign(new Error(msg), { status, expose: true }); }
function slugify(name) { return String(name || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'site'; }

function buildAnswersFromPlan(plan) {
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
    wireframe: plan.wireframe || null,
    style: plan.style || {},
  };
}

export const sitePlanHandoffController = {
  handoffPlan: async (req, res, next) => {
    try {
      const { planId } = req.params;
      const plan = await getSitePlan(planId);
      if (!plan) throw err('Plan not found.', 404);

      const answers = buildAnswersFromPlan(plan);
      const siteName = answers.businessName || plan.sitemap?.name || plan.templateId || 'glondia-site';
      const slug = slugify(siteName);

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

      const site = await createTemplateSite({ templateId: plan.templateId, answers, tailoredPages: [] });

      const generatedSite = await prepareTemplateGeneratedSource(
        { ...site, answers, siteName, slug },
        { answers, siteName, slug, sitemap: plan.sitemap, wireframe: plan.wireframe, style: plan.style }
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
        buildCommand: generatedSite?.buildCommand,
        publishDirectory: generatedSite?.publishDirectory,
        framework: generatedSite?.framework,
      }, { userId: req.user?.id || 'local-user' });

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
      });
    } catch (e) { next(e); }
  },
};
