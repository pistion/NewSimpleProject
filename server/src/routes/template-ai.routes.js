import express from 'express';
import multer from 'multer';
import { templateAiController } from '../controllers/template-ai.controller.js';
import { deployZipSite, validateZipSite } from '../services/zipSiteDeployment.service.js';

const router = express.Router();
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

// ── Multer error handler middleware ──────────────────────────────────────────
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
  // Unknown multer error
  return res.status(400).json({
    error: err.message || 'File upload failed.',
    code: err.code || 'UPLOAD_ERROR',
  });
}

router.get('/settings',                 templateAiController.getSettings);
router.post('/intake/start',            templateAiController.startIntake);
router.post('/intake/message',          templateAiController.sendMessage);
router.post('/generate',                templateAiController.generateTailored);
router.post('/sites',                   templateAiController.createSite);
router.get('/sites/:siteId',            templateAiController.getSite);
router.get('/sites/:siteId/preview',    templateAiController.previewSite);
router.post('/sites/:siteId/deploy',    templateAiController.deploySite);

// ── ZIP deploy endpoint ─────────────────────────────────────────────────────
router.post('/zip/deploy', upload.single('siteZip'), handleMulterError, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'siteZip file is required.', code: 'ZIP_MISSING_FILE' });
    }
    console.log(`[zip-route] ZIP deploy request: ${req.file.originalname} (${req.file.size} bytes)`);
    const result = await deployZipSite({
      fileName: req.file.originalname,
      fileBase64: req.file.buffer.toString('base64'),
      siteName: req.body?.siteName,
      slug: req.body?.slug,
      serviceType: req.body?.serviceType,
      plan: req.body?.plan,
      environment: req.body?.environment,
      buildCommand: req.body?.buildCommand,
      publishDirectory: req.body?.publishDirectory,
      repoUrl: req.body?.repoUrl,
      repositoryUrl: req.body?.repositoryUrl,
      branch: req.body?.branch,
      rootDirectory: req.body?.rootDirectory,
    });
    res.json(result);
  } catch (err) {
    // Return structured JSON errors instead of passing to generic handler
    const status = err.status || 500;
    const code = err.code || 'ZIP_DEPLOY_ERROR';
    const message = err.expose !== false ? (err.message || 'ZIP deploy failed.') : 'An unexpected error occurred during ZIP deployment.';
    console.error(`[zip-route] Error: ${message}`);
    res.status(status).json({ error: message, code, details: err.details || null });
  }
});

// ── ZIP validate endpoint (dev/debug — no deployment) ───────────────────────
router.post('/zip/validate', upload.single('siteZip'), handleMulterError, async (req, res, next) => {
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
    const message = err.expose !== false ? (err.message || 'ZIP validation failed.') : 'An unexpected error occurred during ZIP validation.';
    res.status(status).json({ error: message, code });
  }
});

router.get('/templates/:templateId/preview', templateAiController.getTemplatePreview);

export default router;
