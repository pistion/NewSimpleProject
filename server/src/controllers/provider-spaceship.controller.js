/**
 * provider-spaceship.controller.js
 *
 * Thin HTTP wrappers around providerSpaceship.service.js.
 */

import * as spaceshipService from '../services/providerSpaceship.service.js';

async function getSettings(req, res, next) {
  try {
    res.json(spaceshipService.getSpaceshipSettings());
  } catch (error) {
    next(error);
  }
}

async function checkAvailability(req, res, next) {
  try {
    res.json(await spaceshipService.checkSpaceshipAvailability(req.body?.domains || []));
  } catch (error) {
    next(error);
  }
}

async function listDomains(req, res, next) {
  try {
    res.json(await spaceshipService.listSpaceshipDomains(req.query));
  } catch (error) {
    next(error);
  }
}

async function getDomain(req, res, next) {
  try {
    res.json(await spaceshipService.getSpaceshipDomain(req.params.domain));
  } catch (error) {
    next(error);
  }
}

async function registerDomain(req, res, next) {
  try {
    res.json(await spaceshipService.registerSpaceshipDomain(req.params.domain, req.body || {}));
  } catch (error) {
    next(error);
  }
}

async function renewDomain(req, res, next) {
  try {
    res.json(await spaceshipService.renewSpaceshipDomain(req.params.domain, req.body || {}));
  } catch (error) {
    next(error);
  }
}

async function updateNameservers(req, res, next) {
  try {
    res.json(await spaceshipService.updateSpaceshipNameservers(req.params.domain, req.body || {}));
  } catch (error) {
    next(error);
  }
}

async function updateAutoRenew(req, res, next) {
  try {
    res.json(await spaceshipService.updateSpaceshipAutoRenew(req.params.domain, req.body || {}));
  } catch (error) {
    next(error);
  }
}

async function saveContact(req, res, next) {
  try {
    res.json(await spaceshipService.saveSpaceshipContact(req.body || {}));
  } catch (error) {
    next(error);
  }
}

async function listContacts(req, res, next) {
  try {
    res.json({ items: [], total: 0, message: 'Spaceship contact listing is not exposed by this integration yet.' });
  } catch (error) {
    next(error);
  }
}

async function getOperation(req, res, next) {
  try {
    res.json(await spaceshipService.getSpaceshipOperation(req.params.operationId));
  } catch (error) {
    next(error);
  }
}

async function listDnsRecords(req, res, next) {
  try {
    res.json(await spaceshipService.listSpaceshipDnsRecords(req.params.domain, req.query));
  } catch (error) {
    next(error);
  }
}

async function saveDnsRecords(req, res, next) {
  try {
    res.json(await spaceshipService.saveSpaceshipDnsRecords(req.params.domain, req.body || {}));
  } catch (error) {
    next(error);
  }
}

export default {
  getSettings,
  checkAvailability,
  listDomains,
  getDomain,
  registerDomain,
  renewDomain,
  updateNameservers,
  updateAutoRenew,
  saveContact,
  listContacts,
  getOperation,
  listDnsRecords,
  saveDnsRecords,
};
