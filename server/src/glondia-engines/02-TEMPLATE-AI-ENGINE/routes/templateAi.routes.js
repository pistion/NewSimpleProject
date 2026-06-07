import express from 'express';
import multer from 'multer';
import { templateAiController } from '../controllers/templateAi.controller.js';
import { validateZipSite, getZipDeployConfigStatus } from '../../01-HOSTING-DEPLOY-ENGINE/pipelines/base64ZipToRender.pipeline.js';
import { handleZipDeploy } from '../../01-HOSTING-DEPLOY-ENGINE/adapters/templateAiZipRoute.adapter.js';
import { requireFeature } from '../../../middleware/featureFlag.js';
import { sitePlanController } from '../controllers/sitePlan.controller.js';
import { sitePlanHandoffController } from '../controllers/sitePlanHandoff.controller.js';

const router = express.Router();

// RoxanneAI build + Template Choose are gated behind feature flags. The ZIP
// upload routes below stay open — they are part of the live hosting deploy flow.
const requireAiBuilder = requireFeature('AI_BUILDER');
const requireTemplateMarketplace = requireFeature('TEMPLATE_MARKETPLACE');
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
      err.status = 400;
      err.code = 'ZIP_INVALID_TYPE';
      err.expose = true;
      return cb(err, false);
    }
    cb(null, true);
  },
});

function handleMulterError(err, _req, res, next) {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: `ZIP is too large. Max size is ${Math.round(MAX_ZIP_BYTES / 1024 / 1024)} MB.`,
      code: 'ZIP_TOO_LARGE',
    });
  }
  if (err.code === 'ZIP_INVALID_TYPE') {
    return res.status(400).json({ error: err.message, code: err.code });
  }
  return res.status(400).json({
    error: err.message || 'File upload failed.',
    code: err.code || 'UPLOAD_ERROR',
  });
}

// RoxanneAI guided build flow — disabled until AI_BUILDER launches.
router.get('/settings', requireAiBuilder, templateAiController.getSettings);
router.post('/intake/start', requireAiBuilder, templateAiController.startIntake);
router.post('/intake/message', requireAiBuilder, templateAiController.sendMessage);
router.post('/generate', requireAiBuilder, templateAiController.generateTailored);
router.get('/templates', requireTemplateMarketplace, templateAiController.listTemplates);
router.get('/templates/:templateId', requireTemplateMarketplace, templateAiController.getTemplate);
router.post('/sites', requireTemplateMarketplace, templateAiController.createSite);
router.get('/sites/:siteId', requireTemplateMarketplace, templateAiController.getSite);
router.get('/sites/:siteId/preview', requireTemplateMarketplace, templateAiController.previewSite);
router.post('/sites/:siteId/prepare', requireTemplateMarketplace, templateAiController.prepareSite);
router.post('/sites/:siteId/ai-edit', requireAiBuilder, templateAiController.aiEditSite);
router.post('/sites/:siteId/package', requireTemplateMarketplace, templateAiController.packageSite);
router.post('/sites/:siteId/deploy', requireTemplateMarketplace, templateAiController.deploySite);

// Legacy compatibility route. New callers must use GET /api/deployments/settings.
router.get('/zip/settings', (_req, res) => {
  try {
    res.json(getZipDeployConfigStatus());
  } catch {
    res.status(500).json({ error: 'Failed to read ZIP deploy config.', code: 'ZIP_SETTINGS_ERROR' });
  }
});

// Legacy compatibility route. New callers must use POST /api/deployments/zip.
router.post('/zip/deploy', upload.single('siteZip'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'siteZip file is required.', code: 'ZIP_MISSING_FILE' });
    }
    console.log(`[zip-route] ZIP deploy request: ${req.file.originalname} (${req.file.size} bytes)`);
    await handleZipDeploy(req, res);
  } catch (err) {
    const status = err.status || 500;
    const code = err.code || 'ZIP_DEPLOY_ERROR';
    const message = err.expose !== false
      ? (err.message || 'ZIP deploy failed.')
      : 'An unexpected error occurred during ZIP deployment.';
    const stage = err.stage || codeToStage(code);
    console.error(`[zip-route] Error [${stage}]: ${message}`);
    res.status(status).json({ success: false, error: message, code, stage, details: err.details || null });
  }
});

function codeToStage(code = '') {
  const c = String(code).toLowerCase();
  if (c.startsWith('zip_no') || c === 'zip_empty' || c === 'zip_too_large' || c === 'zip_missing_file') return 'zip_upload';
  if (c.startsWith('zip_path') || c.startsWith('zip_entry') || c === 'zip_no_files' || c === 'zip_no_deployable_entry' || c === 'zip_too_many_deployable_files') return 'zip_validation';
  if (c.startsWith('zip_extract') || c === 'zip_invalid_type' || c === 'zip_bad_request') return 'zip_extract';
  if (c.includes('github') && c.includes('push')) return 'github_push';
  if (c.includes('github') && c.includes('repo')) return 'github_repo_create';
  if (c.includes('render') && (c.includes('service') || c.includes('create'))) return 'render_service_create';
  if (c.includes('render') && c.includes('deploy')) return 'render_deploy_trigger';
  return 'zip_deploy';
}

// Legacy compatibility route. New callers must use POST /api/deployments/zip/validate.
router.post('/zip/validate', upload.single('siteZip'), handleMulterError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'siteZip file is required.', code: 'ZIP_MISSING_FILE' });
    }
    console.log(`[zip-route] ZIP validate request: ${req.file.originalname} (${req.file.size} bytes)`);
    const result = await validateZipSite({
      fileName: req.file.originalname,
      fileBase64: req.file.buffer.toString('base64'),
    });
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    const code = err.code || 'ZIP_VALIDATE_ERROR';
    const message = err.expose !== false
      ? (err.message || 'ZIP validation failed.')
      : 'An unexpected error occurred during ZIP validation.';
    res.status(status).json({ error: message, code });
  }
});

// Template Choose preview — disabled until TEMPLATE_MARKETPLACE launches.
router.get('/templates/:templateId/preview', requireTemplateMarketplace, templateAiController.getTemplatePreview);

// Hybrid site plan routes
router.post('/plans', requireTemplateMarketplace, sitePlanController.createPlan);
router.get('/plans/:planId', requireTemplateMarketplace, sitePlanController.getPlan);
router.put('/plans/:planId/brief', requireTemplateMarketplace, sitePlanController.updateBrief);
router.put('/plans/:planId/sitemap', requireTemplateMarketplace, sitePlanController.updateSitemap);
router.put('/plans/:planId/wireframe', requireTemplateMarketplace, sitePlanController.updateWireframe);
router.put('/plans/:planId/style', requireTemplateMarketplace, sitePlanController.updateStyle);
router.post('/plans/:planId/approve', requireTemplateMarketplace, sitePlanController.approvePlan);
router.post('/plans/:planId/handoff', requireTemplateMarketplace, sitePlanHandoffController.handoffPlan);

export default router;
