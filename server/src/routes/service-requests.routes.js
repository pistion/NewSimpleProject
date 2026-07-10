/**
 * service-requests.routes.js — Service Request intake (not Tickets).
 *
 * Public:   POST /api/public/service-requests  (and /api/v1/public/service-requests)
 * Customer: /api/v1/service-requests  (auth)
 * Admin:    /api/admin/crm/service-requests  (auth + requireAdmin via parent)
 */

import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import * as svc from '../services/serviceRequestService.js';

function sendError(res, err, req) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[service-requests]', err);
  return res.status(status).json({
    success: false,
    error: {
      code: err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR'),
      message: err.message || 'Request failed.',
    },
    requestId: req.id,
  });
}

// ── Public (no auth) ──────────────────────────────────────────────────────────

export const publicServiceRequestRouter = express.Router();

publicServiceRequestRouter.post('/', async (req, res) => {
  try {
    const serviceRequest = await svc.createServiceRequest(req.body || {}, {
      source: req.body?.source || 'public_form',
    });
    res.status(201).json({ serviceRequest, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

// ── Customer (auth) ───────────────────────────────────────────────────────────

export const customerServiceRequestRouter = express.Router();
customerServiceRequestRouter.use(authMiddleware);

customerServiceRequestRouter.post('/', async (req, res) => {
  try {
    const serviceRequest = await svc.createServiceRequest(req.body || {}, {
      source: req.body?.source || 'customer_dashboard',
      userId: req.user?.id || null,
      organizationId: req.user?.organizationId || req.body?.organizationId || null,
      actorUserId: req.user?.id || null,
    });
    res.status(201).json({ serviceRequest, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

customerServiceRequestRouter.get('/', async (req, res) => {
  try {
    const result = await svc.listServiceRequests({
      ...req.query,
      userId: req.user?.id,
    });
    res.json({ ...result, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

// ── Admin CRM (auth + admin applied by parent admin.routes) ───────────────────

export const adminServiceRequestRouter = express.Router();

adminServiceRequestRouter.get('/', async (req, res) => {
  try {
    const result = await svc.listServiceRequests(req.query || {});
    res.json({ ...result, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

adminServiceRequestRouter.get('/:id', async (req, res) => {
  try {
    const serviceRequest = await svc.getServiceRequest(req.params.id);
    res.json({ serviceRequest, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

adminServiceRequestRouter.post('/', async (req, res) => {
  try {
    const serviceRequest = await svc.createServiceRequest(req.body || {}, {
      source: req.body?.source || 'admin_created',
      actorUserId: req.user?.id || null,
      userId: req.body?.userId || null,
    });
    res.status(201).json({ serviceRequest, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

adminServiceRequestRouter.patch('/:id', async (req, res) => {
  try {
    const serviceRequest = await svc.updateServiceRequest(req.params.id, req.body || {}, req.user?.id || null);
    res.json({ serviceRequest, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

adminServiceRequestRouter.post('/:id/contacted', async (req, res) => {
  try {
    const serviceRequest = await svc.markServiceRequestContacted(
      req.params.id,
      req.body?.note || req.body?.adminNotes || '',
      req.user?.id || null,
    );
    res.json({ serviceRequest, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

adminServiceRequestRouter.post('/:id/convert-to-lead', async (req, res) => {
  try {
    const serviceRequest = await svc.convertServiceRequestToLead(req.params.id, req.user?.id || null);
    res.json({ serviceRequest, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

adminServiceRequestRouter.post('/:id/convert-to-ticket', async (req, res) => {
  try {
    const serviceRequest = await svc.convertServiceRequestToTicket(req.params.id, req.user?.id || null);
    res.json({ serviceRequest, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

adminServiceRequestRouter.delete('/:id', async (req, res) => {
  try {
    const result = await svc.deleteServiceRequest(req.params.id, req.user?.id || null);
    res.json({ ...result, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});
