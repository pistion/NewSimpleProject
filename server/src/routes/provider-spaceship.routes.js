/**
 * provider-spaceship.routes.js
 *
 * Spaceship domain registrar routes.
 * Mounted as:
 *   app.use('/api/registrar', requireFeature('DOMAINS'), spaceshipRoutes)  // generic client path
 *   app.use('/api/spaceship', requireFeature('DOMAINS'), spaceshipRoutes)  // provider-specific alias
 */

import express from 'express';
import { providerApiGuard } from '../glondia-engines/01-HOSTING-DEPLOY-ENGINE/services/providerApiGuard.service.js';
import spaceshipController from '../controllers/provider-spaceship.controller.js';

const router = express.Router();

router.get('/settings', spaceshipController.getSettings);
router.post('/availability', providerApiGuard, spaceshipController.checkAvailability);
// Back-compat alias used by older clients.
router.post('/available', providerApiGuard, spaceshipController.checkAvailability);

router.get('/domains', providerApiGuard, spaceshipController.listDomains);
router.get('/domains/:domain', providerApiGuard, spaceshipController.getDomain);
router.post('/domains/:domain/register', providerApiGuard, spaceshipController.registerDomain);
// Back-compat: POST /domains with body.hostname | body.domain
router.post('/domains', providerApiGuard, spaceshipController.registerDomainFromBody);
router.post('/domains/:domain/renew', providerApiGuard, spaceshipController.renewDomain);
router.put('/domains/:domain/nameservers', providerApiGuard, spaceshipController.updateNameservers);
router.put('/domains/:domain/auto-renew', providerApiGuard, spaceshipController.updateAutoRenew);
// Back-compat alias (no hyphen).
router.put('/domains/:domain/autorenew', providerApiGuard, spaceshipController.updateAutoRenew);

router.put('/contacts', providerApiGuard, spaceshipController.saveContact);
// Back-compat: older clients POST contacts.
router.post('/contacts', providerApiGuard, spaceshipController.saveContact);
router.get('/contacts', providerApiGuard, spaceshipController.listContacts);

router.get('/async-operations/:operationId', providerApiGuard, spaceshipController.getOperation);
// Back-compat alias.
router.get('/operations/:operationId', providerApiGuard, spaceshipController.getOperation);

router.get('/dns/:domain/records', providerApiGuard, spaceshipController.listDnsRecords);
router.put('/dns/:domain/records', providerApiGuard, spaceshipController.saveDnsRecords);
// Back-compat pull/push helpers used by the dashboard DNS tools.
router.post('/domains/:domain/dns/pull', providerApiGuard, spaceshipController.pullDnsRecords);
router.post('/domains/:domain/dns/push', providerApiGuard, spaceshipController.pushDnsRecords);

export default router;
