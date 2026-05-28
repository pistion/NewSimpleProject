import express from 'express';
import multer from 'multer';
import { templateAiController } from '../controllers/template-ai.controller.js';
import { deployZipSite } from '../services/zipSiteDeployment.service.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.ZIP_UPLOAD_MAX_BYTES || 25 * 1024 * 1024) },
});

router.get('/settings',                 templateAiController.getSettings);
router.post('/intake/start',            templateAiController.startIntake);
router.post('/intake/message',          templateAiController.sendMessage);
router.post('/generate',                templateAiController.generateTailored);
router.post('/sites',                   templateAiController.createSite);
router.get('/sites/:siteId',            templateAiController.getSite);
router.get('/sites/:siteId/preview',    templateAiController.previewSite);
router.post('/sites/:siteId/deploy',    templateAiController.deploySite);
router.post('/zip/deploy', upload.single('siteZip'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'siteZip file is required.' });
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
  } catch (err) { next(err); }
});
router.get('/templates/:templateId/preview', templateAiController.getTemplatePreview);

export default router;
