/**
 * email.controller.js — HTTP layer for Dashboard Business Email.
 */
import * as emailService from '../services/email.service.js';

export async function getStatus(req, res, next) {
  try {
    const data = await emailService.getEmailStatus(req.user?.id);
    res.json({ data, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function listMailboxes(req, res, next) {
  try {
    const data = await emailService.listMailboxes(req.user?.id);
    res.json({ data, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function requestMailbox(req, res, next) {
  try {
    const data = await emailService.createMailboxRequest(req.user?.id, req.body || {});
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
}

export async function getDns(req, res, next) {
  try {
    const data = await emailService.getEmailDns(req.params.domain);
    res.json({ data, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function checkDns(req, res, next) {
  try {
    const data = await emailService.checkEmailDns(req.params.domain, req.user?.id);
    res.json({ data, requestId: req.id });
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
}
