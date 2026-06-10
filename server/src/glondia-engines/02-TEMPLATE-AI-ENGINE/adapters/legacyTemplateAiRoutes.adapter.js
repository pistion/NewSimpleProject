/**
 * legacyTemplateAiRoutes.adapter.js
 *
 * Mounts all 7 step routes for the Template AI Engine.
 * Also preserves ZIP deploy routes and site plan CRUD/AI routes.
 */

import express from 'express';
import multer from 'multer';

// Step routes
import step01 from '../steps/01-TEMPLATE-LIBRARY/route.js';
import step02 from '../steps/02-TEMPLATE-SOURCE/route.js';
import step03 from '../steps/03-USER-BRIEF/route.js';
import step04 from '../steps/04-AI-REFINEMENT/route.js';
import step05 from '../steps/05-TEMPLATE-EDITING/route.js';
import step06 from '../steps/06-PREVIEW/route.js';
import step07 from '../steps/07-HANDOFF-DEPLOY/route.js';

// Plan CRUD + AI refinement
import { sitePlanController } from '../controllers/sitePlan.controller.js';
import { sitePlanHandoffController } from '../controllers/sitePlanHandoff.controller.js';
import { answerSheetController } from '../05-ANSWER-SHEET-MOUNTAIN/answerSheet.controller.js';
import {
  suggestSitemapForPlan,
  autofillBrief,
  suggestSectionsForPage,
  suggestWireframe,
} from '../../../services/sitePlanAi.service.js';

// ZIP deploy (existing live hosting flow — do not change)
import { validateZipSite, getZipDeployConfigStatus } from '../../01-HOSTING-DEPLOY-ENGINE/pipelines/base64ZipToRender.pipeline.js';
import { handleZipDeploy } from '../../01-HOSTING-DEPLOY-ENGINE/adapters/templateAiZipRoute.adapter.js';
import { requireFeature } from '../../../middleware/featureFlag.js';
import authMiddleware from '../../../middleware/authMiddleware.js';

const router = express.Router();

const requireAiBuilder = requireFeature('AI_BUILDER');
const requireTemplateMarketplace = requireFeature('TEMPLATE_MARKETPLACE');

// ── Handoff — must be registered BEFORE step routes (step07 previously had a
//    duplicate that would shadow this one). The sitePlanHandoffController includes
//    the answer-sheet validation layer. ─────────────────────────────────────────
router.post('/plans/:planId/handoff', requireTemplateMarketplace, authMiddleware, sitePlanHandoffController.handoffPlan);

// ── Step routes (01–07) ───────────────────────────────────────────────────────
router.use('/', step01);
router.use('/', step02);
router.use('/', step03);
router.use('/', step04);
router.use('/', step05);
router.use('/', step06);
router.use('/', step07);

// ── Site plan CRUD ────────────────────────────────────────────────────────────
router.post('/plans', requireTemplateMarketplace, authMiddleware, sitePlanController.createPlan);
router.get('/plans/:planId', requireTemplateMarketplace, authMiddleware, sitePlanController.getPlan);
router.put('/plans/:planId/brief', requireTemplateMarketplace, authMiddleware, sitePlanController.updateBrief);
router.put('/plans/:planId/sitemap', requireTemplateMarketplace, authMiddleware, sitePlanController.updateSitemap);
router.put('/plans/:planId/wireframe', requireTemplateMarketplace, authMiddleware, sitePlanController.updateWireframe);
router.put('/plans/:planId/style', requireTemplateMarketplace, authMiddleware, sitePlanController.updateStyle);
router.post('/plans/:planId/approve', requireTemplateMarketplace, authMiddleware, sitePlanController.approvePlan);

// ── Answer sheet routes ───────────────────────────────────────────────────────
router.get('/plans/:planId/answer-sheet', requireTemplateMarketplace, authMiddleware, answerSheetController.getAnswerSheet);
router.post('/plans/:planId/answer-sheet/build', requireTemplateMarketplace, authMiddleware, answerSheetController.buildAnswerSheet);
router.post('/plans/:planId/answer-sheet/generate', requireTemplateMarketplace, authMiddleware, answerSheetController.completeAnswerSheet);
router.put('/plans/:planId/answer-sheet', requireTemplateMarketplace, authMiddleware, answerSheetController.updateAnswerSheet);
router.post('/plans/:planId/answer-sheet/approve', requireTemplateMarketplace, authMiddleware, answerSheetController.approveAnswerSheet);

// ── Site plan AI endpoints ────────────────────────────────────────────────────
router.post('/plans/:planId/ai/suggest-sitemap', requireTemplateMarketplace, authMiddleware, async (req, res, next) => {
  try { res.json({ data: await suggestSitemapForPlan(req.params.planId) }); } catch (e) { next(e); }
});
router.post('/plans/:planId/ai/autofill-brief', requireTemplateMarketplace, authMiddleware, async (req, res, next) => {
  try { res.json({ data: await autofillBrief(req.params.planId) }); } catch (e) { next(e); }
});
router.post('/plans/:planId/ai/suggest-sections/:pageId', requireTemplateMarketplace, authMiddleware, async (req, res, next) => {
  try { res.json({ data: await suggestSectionsForPage(req.params.planId, req.params.pageId) }); } catch (e) { next(e); }
});
router.post('/plans/:planId/ai/suggest-wireframe', requireTemplateMarketplace, authMiddleware, async (req, res, next) => {
  try { res.json({ data: await suggestWireframe(req.params.planId) }); } catch (e) { next(e); }
});

// ── ZIP deploy (live hosting flow — preserved as-is) ─────────────────────────
const MAX_ZIP_BYTES = Number(process.env.ZIP_UPLOAD_MAX_BYTES || 25 * 1024 * 1024);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ZIP_BYTES },
  fileFilter(_req, file, cb) {
    const mime = String(file.mimetype || '').toLowerCase();
    const name = String(file.originalname || '').toLowerCase();
    const isZip = mime.includes('zip') || mime === 'application/octet-stream' || name.endsWith('.zip');
    if (!isZip) {
      const err = new Error('Only .zip files are accepted.');
      err.status = 400; err.code = 'ZIP_INVALID_TYPE'; err.expose = true;
      return cb(err, false);
    }
    cb(null, true);
  },
});

function handleMulterError(err, _req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: `ZIP is too large. Max size is ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} MB.`, code: 'ZIP_TOO_LARGE' });
  if (err.code === 'ZIP_INVALID_TYPE') return res.status(400).json({ error: err.message, code: err.code });
  return res.status(400).json({ error: err.message || 'File upload failed.', code: err.code || 'UPLOAD_ERROR' });
}

router.get('/zip/settings', (_req, res) => {
  try { res.json(getZipDeployConfigStatus()); } catch { res.status(500).json({ error: 'Failed to read ZIP deploy config.', code: 'ZIP_SETTINGS_ERROR' }); }
});

router.post('/zip/deploy', upload.single('siteZip'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'siteZip file is required.', code: 'ZIP_MISSING_FILE' });
    await handleZipDeploy(req, res);
  } catch (err) {
    const status = err.status || 500;
    const code = err.code || 'ZIP_DEPLOY_ERROR';
    const message = err.expose !== false ? (err.message || 'ZIP deploy failed.') : 'An unexpected error occurred during ZIP deployment.';
    res.status(status).json({ success: false, error: message, code, stage: err.stage || 'zip_deploy', details: err.details || null });
  }
});

router.post('/zip/validate', upload.single('siteZip'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'siteZip file is required.', code: 'ZIP_MISSING_FILE' });
    res.json(await validateZipSite({ fileName: req.file.originalname, fileBase64: req.file.buffer.toString('base64') }));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.expose !== false ? (err.message || 'ZIP validation failed.') : 'An unexpected error occurred.', code: err.code || 'ZIP_VALIDATE_ERROR' });
  }
});

export default router;
