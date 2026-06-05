import express from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import AuthController from '../controllers/auth.controller.js';
import GitHubOAuthController from '../controllers/githubOAuth.controller.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { ID_PHOTOS_ROOT, USER_AVATARS_ROOT } from '../services/adminReceiptService.js';

const router = express.Router();

// ── ID photo upload (the signed-in customer, their own photo) ─────────────────
const ID_PHOTO_MAX_BYTES = Number(process.env.ID_PHOTO_MAX_BYTES || 5 * 1024 * 1024);
const ID_PHOTO_EXT = new Set(['.png', '.jpg', '.jpeg']);

function safeSegment(value, fallback) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return clean || fallback;
}

const idPhotoStorage = multer.diskStorage({
  destination(req, _file, cb) {
    const dir = join(ID_PHOTOS_ROOT, safeSegment(req.user?.id, 'unknown'));
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

// ── Profile avatar/headshot upload (separate from the private ID photo) ────────
const AVATAR_MAX_BYTES = Number(process.env.AVATAR_MAX_BYTES || 5 * 1024 * 1024);
const AVATAR_EXT = new Set(['.png', '.jpg', '.jpeg']);

const avatarStorage = multer.diskStorage({
  destination(req, _file, cb) {
    const dir = join(USER_AVATARS_ROOT, safeSegment(req.user?.id, 'unknown'));
    try { mkdirSync(dir, { recursive: true }); cb(null, dir); } catch (err) { cb(err); }
  },
  filename(_req, file, cb) {
    const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `avatar-${Date.now()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const ext = extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (AVATAR_EXT.has(ext) && (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg' || mime.startsWith('image/'))) {
      return cb(null, true);
    }
    const err = new Error('Only PNG, JPG or JPEG profile photos are accepted.');
    err.status = 400; err.code = 'AVATAR_INVALID_TYPE'; err.expose = true;
    return cb(err);
  },
});

// GitHub OAuth sign-in
router.get('/github',          GitHubOAuthController.redirect);
router.get('/github/callback', GitHubOAuthController.callback);

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/refresh-token', AuthController.refreshToken);
router.post('/logout', AuthController.logout);

// Protected: requires a valid access token.
router.get('/me', authMiddleware, AuthController.me);

// Self-service profile (account details the client can update).
router.get('/profile', authMiddleware, AuthController.getProfile);
router.patch('/profile', authMiddleware, AuthController.updateProfile);
router.post('/profile/id-photo', authMiddleware, idPhotoUpload.single('idPhoto'), AuthController.uploadIdPhoto);
router.get('/profile/id-photo', authMiddleware, AuthController.viewIdPhoto);
router.post('/profile/avatar', authMiddleware, avatarUpload.single('avatar'), AuthController.uploadAvatar);
router.get('/profile/avatar', authMiddleware, AuthController.viewAvatar);

export default router;
