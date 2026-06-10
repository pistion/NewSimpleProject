/**
 * provider-spaceship.routes.js
 *
 * Spaceship domain registrar routes.
 * Mount in server.js with: app.use('/api/spaceship', requireFeature('DOMAINS'), spaceshipRoutes)
 */

import express from 'express';
import { providerApiGuard } from '../glondia-engines/01-HOSTING-DEPLOY-ENGINE/services/providerApiGuard.service.js';
import spaceshipController from '../controllers/provider-spaceship.controller.js';

const router = express.Router();

router.get('/settings', spaceshipController.getSettings);
router.post('/availability', providerApiGuard, spaceshipController.checkAvailability);
router.get('/domains', providerApiGuard, spaceshipController.listDomains);
router.get('/domains/:domain', providerApiGuard, spaceshipController.getDomain);
router.post('/domains/:domain/register', providerApiGuard, spaceshipController.registerDomain);
router.post('/domains/:domain/renew', providerApiGuard, spaceshipController.renewDomain);
router.put('/domains/:domain/nameservers', providerApiGuard, spaceshipController.updateNameservers);
router.put('/domains/:domain/auto-renew', providerApiGuard, spaceshipController.updateAutoRenew);
router.put('/contacts', providerApiGuard, spaceshipController.saveContact);
router.get('/contacts', providerApiGuard, spaceshipController.listContacts);
router.get('/async-operations/:operationId', providerApiGuard, spaceshipController.getOperation);
router.get('/dns/:domain/records', providerApiGuard, spaceshipController.listDnsRecords);
router.put('/dns/:domain/records', providerApiGuard, spaceshipController.saveDnsRecords);

export default router;
