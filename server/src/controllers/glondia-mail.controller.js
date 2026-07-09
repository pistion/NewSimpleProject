/**
 * glondia-mail.controller.js — HTTP layer for GlondiaMail webmail.
 */
import * as mailService from '../services/glondia-mail.service.js';

export async function login(req, res, next) {
  try {
    const data = await mailService.login(req.body || {});
    res.json({ data, requestId: req.id });
  } catch (err) {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({
        success: false,
        error: { code: err.code || 'ERROR', message: err.message },
        requestId: req.id,
      });
    }
    if (err.status === 503) {
      return res.status(503).json({
        success: false,
        error: { code: err.code || 'GLONDIA_MAIL_NOT_CONFIGURED', message: err.message },
        requestId: req.id,
      });
    }
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const data = await mailService.logout();
    res.json({ data, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function session(req, res, next) {
  try {
    const data = await mailService.getSession(req);
    res.json({ data, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function folders(req, res, next) {
  try {
    const data = await mailService.listFolders();
    res.json({ data, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function messages(req, res, next) {
  try {
    const data = await mailService.listMessages(req.query || {});
    res.json({ data, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function message(req, res, next) {
  try {
    const data = await mailService.getMessage(req.params.id);
    res.json({ data, requestId: req.id });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: { code: err.code || 'ERROR', message: err.message },
        requestId: req.id,
      });
    }
    next(err);
  }
}

export async function send(req, res, next) {
  try {
    const data = await mailService.sendMail(req.body || {});
    res.status(201).json({ data, requestId: req.id });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: { code: err.code || 'ERROR', message: err.message },
        requestId: req.id,
      });
    }
    next(err);
  }
}
