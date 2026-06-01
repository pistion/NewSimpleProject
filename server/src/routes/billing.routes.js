import express from 'express';
import BillingController from '../controllers/billing.controller.js';
import UsageController from '../controllers/usage.controller.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router({ mergeParams: true });

// Billing — simple plan catalog + the user's current plan/quota.
router.get('/summary', authMiddleware, BillingController.getSummary);
router.get('/plans', BillingController.listPlans);

// Usage
router.get('/usage/summary', UsageController.getSummary);

export default router;
