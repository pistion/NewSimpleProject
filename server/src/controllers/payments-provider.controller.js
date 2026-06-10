/**
 * payments-provider.controller.js
 *
 * Thin HTTP wrappers around payments-provider.service.js.
 * No business logic here — all logic lives in the service.
 */

import * as paymentsProviderService from '../services/payments-provider.service.js';

async function getPaypalClient(req, res, next) {
  try {
    res.json(paymentsProviderService.getPaypalClientSettings());
  } catch (error) {
    next(error);
  }
}

async function createDomainOrder(req, res, next) {
  try {
    res.json(await paymentsProviderService.createDomainPaymentOrder(req.body || {}, req.user || {}));
  } catch (error) {
    next(error);
  }
}

async function captureDomainOrder(req, res, next) {
  try {
    res.json(await paymentsProviderService.captureDomainPaymentOrder(req.body || {}, req.user || {}));
  } catch (error) {
    next(error);
  }
}

async function createHostingOrder(req, res, next) {
  try {
    res.json(await paymentsProviderService.createHostingPaymentOrder(req.body || {}, req.user || {}));
  } catch (error) {
    next(error);
  }
}

async function captureHostingOrder(req, res, next) {
  try {
    res.json(await paymentsProviderService.captureHostingPaymentOrder(req.body || {}, req.user || {}));
  } catch (error) {
    next(error);
  }
}

async function getHostingStatus(req, res, next) {
  try {
    res.json(await paymentsProviderService.getHostingPaymentStatus(req.params.deploymentId));
  } catch (error) {
    next(error);
  }
}

export default {
  getPaypalClient,
  createDomainOrder,
  captureDomainOrder,
  createHostingOrder,
  captureHostingOrder,
  getHostingStatus,
};
