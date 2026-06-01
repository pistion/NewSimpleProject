import express from 'express';
import BillingController from '../controllers/billing.controller.js';
import UsageController from '../controllers/usage.controller.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router({ mergeParams: true });

// Billing — deploy-first K100 summary: pricing, the user's own orders +
// deployment bills, and provider/payment-method status.
router.get('/summary', authMiddleware, BillingController.getSummary);

// Usage
router.get('/usage/summary', UsageController.getSummary);

export default router;
