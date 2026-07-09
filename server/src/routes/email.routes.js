/**
 * email.routes.js — client business email API.
 *
 * GET  /mailboxes  — list mailboxes for the signed-in user
 * POST /requests   — submit a mailbox setup request
 *
 * Mounted at /api/v1/email behind requireFeature('EMAIL').
 * Does not expose provider secrets or mailbox passwords.
 */
import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { listMailboxes, createMailboxRequest } from '../services/emailService.js';

const router = express.Router();
router.use(authMiddleware);

router.get('/mailboxes', async (req, res, next) => {
  try {
    const data = await listMailboxes(req.user?.id);
    res.json({ data, requestId: req.id });
  } catch (err) {
    next(err);
  }
});

router.post('/requests', async (req, res, next) => {
  try {
    const data = await createMailboxRequest(req.user?.id, req.body || {});
    res.status(201).json({ data, requestId: req.id });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({
        success: false,
        error: { code: err.code || 'VALIDATION_ERROR', message: err.message },
        requestId: req.id,
      });
    }
    next(err);
  }
});

export default router;
