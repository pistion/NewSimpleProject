/**
 * admin.routes.js — simple admin surface for deploy-first billing.
 * All routes require an authenticated admin (role === 'admin').
 */
import express from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import authMiddleware from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import adminService from '../services/adminService.js';
import {
  getReceiptMeta,
  streamReceipt,
  streamUserIdPhoto,
  streamUserAvatar,
  ID_PHOTOS_ROOT,
} from '../services/adminReceiptService.js';

const router = express.Router();

router.use(authMiddleware, requireAdmin);

// ── ID photo upload (admin) ───────────────────────────────────────────────────
const ID_PHOTO_MAX_BYTES = Number(process.env.ID_PHOTO_MAX_BYTES || 5 * 1024 * 1024);
const ID_PHOTO_EXT = new Set(['.png', '.jpg', '.jpeg']);

function safeSegment(value, fallback) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return clean || fallback;
}

const idPhotoStorage = multer.diskStorage({
  destination(req, _file, cb) {
    const dir = join(ID_PHOTOS_ROOT, safeSegment(req.params?.userId, 'unknown'));
    try { mkdirSync(dir, { recursive: true }); cb(null, dir); } catch (err) { cb(err); }
  },
  filename(_req, file, cb) {
    const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `id-photo-${Date.now()}${ext}`);
  },
});

const idPhotoUpload = multer({
  storage: idPhotoStorage,
  limits: { fileSize: ID_PHOTO_MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const ext = extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (ID_PHOTO_EXT.has(ext) && (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg' || mime.startsWith('image/'))) {
      return cb(null, true);
    }
    const err = new Error('Only PNG, JPG or JPEG ID photos are accepted.');
    err.status = 400; err.code = 'ID_PHOTO_INVALID_TYPE'; err.expose = true;
    return cb(err);
  },
});

// ── Overview + lists ──────────────────────────────────────────────────────────
router.get('/overview', async (req, res, next) => {
  try { res.json({ data: await adminService.getOverview(), requestId: req.id }); } catch (e) { next(e); }
});

router.get('/users', async (req, res, next) => {
  try { res.json({ data: await adminService.listUsers(), requestId: req.id }); } catch (e) { next(e); }
});

router.get('/deployments', async (req, res, next) => {
  try { res.json({ data: await adminService.listDeployments(), requestId: req.id }); } catch (e) { next(e); }
});

router.get('/orders', async (req, res, next) => {
  try { res.json({ data: await adminService.listOrders(), requestId: req.id }); } catch (e) { next(e); }
});

router.get('/receipts', async (req, res, next) => {
  try { res.json({ data: await adminService.listReceipts(), requestId: req.id }); } catch (e) { next(e); }
});

// ── Receipt preview/download (safe: ID lookup → path/ext validation → stream) ──
router.get('/receipts/:receiptId', async (req, res, next) => {
  try { res.json({ data: await getReceiptMeta(req.params.receiptId), requestId: req.id }); } catch (e) { next(e); }
});

router.get('/receipts/:receiptId/view', async (req, res, next) => {
  try {
    await streamReceipt({ receiptId: req.params.receiptId, disposition: 'inline', res, adminUserId: req.user.id });
  } catch (e) { next(e); }
});

router.get('/receipts/:receiptId/download', async (req, res, next) => {
  try {
    await streamReceipt({ receiptId: req.params.receiptId, disposition: 'attachment', res, adminUserId: req.user.id });
  } catch (e) { next(e); }
});

router.post('/receipts/:receiptId/approve', async (req, res, next) => {
  try { res.json({ data: await adminService.approveReceipt(req.params.receiptId, req.user.id), requestId: req.id }); } catch (e) { next(e); }
});

router.post('/receipts/:receiptId/reject', async (req, res, next) => {
  try { res.json({ data: await adminService.rejectReceipt(req.params.receiptId, req.user.id, req.body?.note), requestId: req.id }); } catch (e) { next(e); }
});

// ── User detail + account lifecycle ───────────────────────────────────────────
router.get('/users/:userId', async (req, res, next) => {
  try { res.json({ data: await adminService.getUserDetail(req.params.userId), requestId: req.id }); } catch (e) { next(e); }
});

router.patch('/users/:userId', async (req, res, next) => {
  try { res.json({ data: await adminService.updateUser(req.params.userId, req.body || {}, req.user.id), requestId: req.id }); } catch (e) { next(e); }
});

// Suspend = temporary account hold (reversible); cascades a suspend to sites.
router.post('/users/:userId/suspend', async (req, res, next) => {
  try { res.json({ data: await adminService.suspendUser(req.params.userId, req.body?.reason, req.user.id), requestId: req.id }); } catch (e) { next(e); }
});

router.post('/users/:userId/disable', async (req, res, next) => {
  try { res.json({ data: await adminService.disableUser(req.params.userId, req.body?.reason, req.user.id), requestId: req.id }); } catch (e) { next(e); }
});

router.post('/users/:userId/reactivate', async (req, res, next) => {
  try {
    res.json({
      data: await adminService.reactivateUser(req.params.userId, req.user.id, {
        resumeDeployments: req.body?.resumeDeployments === true || req.body?.resumeDeployments === 'true',
      }),
      requestId: req.id,
    });
  } catch (e) { next(e); }
});

router.post('/users/:userId/delete', async (req, res, next) => {
  try { res.json({ data: await adminService.deleteUser(req.params.userId, req.body?.reason, req.user.id), requestId: req.id }); } catch (e) { next(e); }
});

// ── ID photo upload + inline view (admin) ─────────────────────────────────────
router.post('/users/:userId/id-photo', idPhotoUpload.single('idPhoto'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'ID_PHOTO_REQUIRED', message: 'An ID photo file is required.' }, requestId: req.id });
    }
    const data = await adminService.setUserIdPhotoPath(req.params.userId, req.file.path, req.user.id);
    res.status(201).json({ data, requestId: req.id });
  } catch (e) { next(e); }
});

router.get('/users/:userId/id-photo', async (req, res, next) => {
  try {
    await streamUserIdPhoto({ userId: req.params.userId, res, adminUserId: req.user.id });
  } catch (e) { next(e); }
});

// Admin view of any user's profile avatar (authenticated + admin-gated).
router.get('/users/:userId/avatar', async (req, res, next) => {
  try {
    await streamUserAvatar({ userId: req.params.userId, res, viewerUserId: req.user.id });
  } catch (e) { next(e); }
});

// ── Deployment lifecycle ──────────────────────────────────────────────────────
router.post('/deployments/:deploymentId/mark-paid', async (req, res, next) => {
  try { res.json({ data: await adminService.adminMarkDeploymentPaid(req.params.deploymentId, req.user.id), requestId: req.id }); } catch (e) { next(e); }
});

router.post('/deployments/:deploymentId/delete', async (req, res, next) => {
  try { res.json({ data: await adminService.adminDeleteDeployment(req.params.deploymentId, req.user.id), requestId: req.id }); } catch (e) { next(e); }
});

router.post('/deployments/:deploymentId/suspend', async (req, res, next) => {
  try { res.json({ data: await adminService.suspendDeployment(req.params.deploymentId, req.user.id, req.body?.reason), requestId: req.id }); } catch (e) { next(e); }
});

router.post('/deployments/:deploymentId/reactivate', async (req, res, next) => {
  try { res.json({ data: await adminService.reactivateDeployment(req.params.deploymentId, req.user.id), requestId: req.id }); } catch (e) { next(e); }
});

router.post('/deployments/:deploymentId/approve-billing', async (req, res, next) => {
  try { res.json({ data: await adminService.approveDeploymentBilling(req.params.deploymentId, req.user.id), requestId: req.id }); } catch (e) { next(e); }
});

router.post('/deployments/:deploymentId/renew-manually', async (req, res, next) => {
  try { res.json({ data: await adminService.adminRenewDeploymentManually(req.params.deploymentId, req.user.id), requestId: req.id }); } catch (e) { next(e); }
});

// Manual Render plan override: { plan: 'free'|'starter'|'standard', redeploy: bool }
router.post('/deployments/:deploymentId/render-plan', async (req, res, next) => {
  try {
    res.json({
      data: await adminService.setDeploymentRenderPlan(req.params.deploymentId, req.body?.plan, {
        redeploy: req.body?.redeploy === true || req.body?.redeploy === 'true',
        adminUserId: req.user.id,
      }),
      requestId: req.id,
    });
  } catch (e) { next(e); }
});

export default router;
