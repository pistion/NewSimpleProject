// sitePlan.controller.js — CRUD controller for hybrid site plans
import { createSitePlan, getSitePlan, updateSitePlan, listSitePlans } from '../store/sitePlanStore.js';

function err(msg, status = 400) { return Object.assign(new Error(msg), { status, expose: true }); }

export const sitePlanController = {
  createPlan: async (req, res, next) => {
    try {
      if (!req.body?.templateId) throw err('templateId is required.', 400);
      const plan = await createSitePlan(req.body);
      res.status(201).json({ data: plan });
    } catch (e) { next(e); }
  },
  getPlan: async (req, res, next) => {
    try {
      const plan = await getSitePlan(req.params.planId);
      if (!plan) throw err('Plan not found.', 404);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
  updateBrief: async (req, res, next) => {
    try {
      const plan = await updateSitePlan(req.params.planId, { brief: req.body });
      if (!plan) throw err('Plan not found.', 404);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
  updateSitemap: async (req, res, next) => {
    try {
      const plan = await updateSitePlan(req.params.planId, { sitemap: req.body });
      if (!plan) throw err('Plan not found.', 404);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
  updateWireframe: async (req, res, next) => {
    try {
      const plan = await updateSitePlan(req.params.planId, { wireframe: req.body });
      if (!plan) throw err('Plan not found.', 404);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
  updateStyle: async (req, res, next) => {
    try {
      const plan = await updateSitePlan(req.params.planId, { style: req.body });
      if (!plan) throw err('Plan not found.', 404);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
  approvePlan: async (req, res, next) => {
    try {
      const plan = await updateSitePlan(req.params.planId, { status: 'approved', approvedAt: new Date().toISOString() });
      if (!plan) throw err('Plan not found.', 404);
      res.json({ data: plan });
    } catch (e) { next(e); }
  },
};
