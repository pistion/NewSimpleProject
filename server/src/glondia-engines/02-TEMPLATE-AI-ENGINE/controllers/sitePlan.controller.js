// sitePlan.controller.js — CRUD controller for hybrid site plans
import { createSitePlan, getSitePlan, updateSitePlan, listSitePlans } from '../store/sitePlanStore.js';
import { buildPlanSeedFromTemplate } from '../services/templatePreviewToPlan.service.js';

function err(msg, status = 400) { return Object.assign(new Error(msg), { status, expose: true }); }

export const sitePlanController = {
  createPlan: async (req, res, next) => {
    try {
      if (!req.body?.templateId) throw err('templateId is required.', 400);

      // Seed the new plan with template sitemap/wireframe/style from library
      let templateSeed = {};
      try {
        templateSeed = await buildPlanSeedFromTemplate(req.body.templateId);
      } catch {
        // Non-fatal — plan creates without seed if template library is unavailable
      }

      const plan = await createSitePlan({
        // template seed comes first so caller body can override
        ...templateSeed,
        ...req.body,
        // Preserve nested seed fields unless caller explicitly supplied them
        sitemap: req.body.sitemap ?? templateSeed.sitemap ?? null,
        wireframe: req.body.wireframe ?? templateSeed.wireframe ?? null,
        style: req.body.style ?? templateSeed.style ?? null,
        templateManifest: req.body.templateManifest ?? templateSeed.templateManifest ?? null,
        userId: req.user?.id || null,
        ownerUserId: req.user?.id || null,
      });
      res.status(201).json({ data: plan });
    } catch (e) { next(e); }
  },
  getPlan: async (req, res, next) => {
    try {
      const plan = await assertPlanAccess(req.params.planId, req.user);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
  updateBrief: async (req, res, next) => {
    try {
      await assertPlanAccess(req.params.planId, req.user);
      const plan = await updateSitePlan(req.params.planId, { brief: req.body });
      if (!plan) throw err('Plan not found.', 404);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
  updateSitemap: async (req, res, next) => {
    try {
      await assertPlanAccess(req.params.planId, req.user);
      // Unwrap { sitemap: {...} } or accept flat sitemap object directly
      const sitemap = req.body?.sitemap ?? req.body;
      const plan = await updateSitePlan(req.params.planId, { sitemap });
      if (!plan) throw err('Plan not found.', 404);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
  updateWireframe: async (req, res, next) => {
    try {
      await assertPlanAccess(req.params.planId, req.user);
      const wireframe = req.body?.wireframe ?? req.body;
      const plan = await updateSitePlan(req.params.planId, { wireframe });
      if (!plan) throw err('Plan not found.', 404);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
  updateStyle: async (req, res, next) => {
    try {
      await assertPlanAccess(req.params.planId, req.user);
      const style = req.body?.style ?? req.body;
      const plan = await updateSitePlan(req.params.planId, { style });
      if (!plan) throw err('Plan not found.', 404);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
  approvePlan: async (req, res, next) => {
    try {
      await assertPlanAccess(req.params.planId, req.user);
      const plan = await updateSitePlan(req.params.planId, { status: 'approved', approvedAt: new Date().toISOString() });
      if (!plan) throw err('Plan not found.', 404);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
};

async function assertPlanAccess(planId, user) {
  const plan = await getSitePlan(planId);
  if (!plan) throw err('Plan not found.', 404);
  if (user?.role === 'admin') return plan;
  const owner = plan.userId || plan.ownerUserId || null;
  if (!user?.id || owner !== user.id) throw err('You do not have access to this site plan.', 403);
  return plan;
}
