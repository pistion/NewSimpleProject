import express from 'express';
import multer from 'multer';
import { templateAiController } from '../controllers/template-ai.controller.js';
import { deployZipSite, validateZipSite, getZipDeployConfigStatus } from '../services/zipSiteDeployment.service.js';

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

// ── ZIP config diagnostics (no secrets returned) ───────────────────────────
router.get('/zip/settings', (_req, res) => {
  try {
    res.json(getZipDeployConfigStatus());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read ZIP deploy config.', code: 'ZIP_SETTINGS_ERROR' });
  }
});

// ── ZIP deploy endpoint ─────────────────────────────────────────────────────
router.post('/zip/deploy', upload.single('siteZip'), handleMulterError, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'siteZip file is required.', code: 'ZIP_MISSING_FILE' });
    }
    console.log(`[zip-route] ZIP deploy request: ${req.file.originalname} (${req.file.size} bytes)`);
    // Parse optional JSON fields sent as form-data strings
    const safeJson = (raw) => { try { return raw ? JSON.parse(raw) : null; } catch { return null; } };

    const result = await deployZipSite({
      fileName: req.file.originalname,
      fileBase64: req.file.buffer.toString('base64'),
      userId: req.user?.id || req.headers['x-user-id'] || req.headers['x-glondia-user-id'] || 'local-user',
      // ── Identity ───────────────────────────────────────────────────────
      siteName: req.body?.siteName,
      slug: req.body?.slug,
      // ── Deploy settings ────────────────────────────────────────────────
      serviceType: req.body?.serviceType,
      plan: req.body?.plan,
      region: req.body?.region,
      environment: req.body?.environment,
      // ── Build settings ─────────────────────────────────────────────────
      buildCommand: req.body?.buildCommand,
      publishDirectory: req.body?.publishDirectory,
      startCommand: req.body?.startCommand,
      runtime: req.body?.runtime,
      healthCheckPath: req.body?.healthCheckPath,
      pullRequestPreviewsEnabled: req.body?.pullRequestPreviewsEnabled,
      // ── Source settings ────────────────────────────────────────────────
      repoUrl: req.body?.repoUrl,
      repositoryUrl: req.body?.repositoryUrl,
      branch: req.body?.branch,
      rootDirectory: req.body?.rootDirectory,
      // ── Environment variables — JSON array [{ key, value }] ────────────
      envVars: safeJson(req.body?.envVars),
      // ── Persistent disk — JSON object { name, mountPath, sizeGB } ──────
      disk: safeJson(req.body?.disk),
    });
    res.json(result);
  } catch (err) {
    // Return structured JSON errors with stage field as required by the deployment engine spec.
    const status = err.status || 500;
    const code = err.code || 'ZIP_DEPLOY_ERROR';
    const message = err.expose !== false ? (err.message || 'ZIP deploy failed.') : 'An unexpected error occurred during ZIP deployment.';
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
