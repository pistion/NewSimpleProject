/**
 * adminCustomerController.js — HTTP layer for admin customer oversight.
 *
 * Speaks HTTP only: parses params, calls adminCustomerOversightService, and
 * renders the pack's stable error format:
 *   { error: { code, message }, requestId }
 */

import * as oversight from '../services/adminCustomerOversightService.js';

function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      res.status(err.status || 500).json({
        error: {
          code: err.code || (err.status === 404 ? 'ADMIN_CUSTOMER_NOT_FOUND' : 'ADMIN_CUSTOMER_ERROR'),
          message: err.expose || err.status ? err.message : 'Internal error.',
        },
        requestId: req.id,
      });
    }
  };
}

export const getOverview = wrap(async (req, res) => {
  res.json({ data: await oversight.getCustomerOverview(req.params.userId), requestId: req.id });
});

export const getServices = wrap(async (req, res) => {
  res.json({ data: await oversight.getCustomerServices(req.params.userId), requestId: req.id });
});

export const getBilling = wrap(async (req, res) => {
  res.json({ data: await oversight.getCustomerBilling(req.params.userId), requestId: req.id });
});

export const getSupport = wrap(async (req, res) => {
  res.json({ data: await oversight.getCustomerSupport(req.params.userId), requestId: req.id });
});

export const getOperations = wrap(async (req, res) => {
  res.json({ data: await oversight.getCustomerOperations(req.params.userId), requestId: req.id });
});

export const getActivity = wrap(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  res.json({ data: await oversight.getCustomerActivity(req.params.userId, { limit, offset }), requestId: req.id });
});
