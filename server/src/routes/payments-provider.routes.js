/**
 * payments-provider.routes.js
 *
 * Payment routes for PayPal client config, domain purchases, and hosting billing.
 * Mounted at /api/payments in server.js — BEFORE the existing paymentsRoutes
 * so these more-specific paths take priority.
 */

import express from 'express';
import { providerApiGuard } from '../glondia-engines/01-HOSTING-DEPLOY-ENGINE/services/providerApiGuard.service.js';
import paymentsProviderController from '../controllers/payments-provider.controller.js';

const router = express.Router();

router.get('/paypal-client', paymentsProviderController.getPaypalClient);
router.post('/domain/create-order', providerApiGuard, paymentsProviderController.createDomainOrder);
router.post('/domain/capture', providerApiGuard, paymentsProviderController.captureDomainOrder);
router.post('/hosting/create-order', providerApiGuard, paymentsProviderController.createHostingOrder);
router.post('/hosting/capture', providerApiGuard, paymentsProviderController.captureHostingOrder);
router.get('/hosting/status/:deploymentId', paymentsProviderController.getHostingStatus);

export default router;
