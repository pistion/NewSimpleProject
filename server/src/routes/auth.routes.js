import express from 'express';
import AuthController from '../controllers/auth.controller.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/refresh-token', AuthController.refreshToken);
router.post('/logout', AuthController.logout);

// Protected: requires a valid access token.
router.get('/me', authMiddleware, AuthController.me);

export default router;
