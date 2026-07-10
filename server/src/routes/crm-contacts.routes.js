/**
 * Admin CRM contacts / email lists — backed by crm_email_lists + members.
 * Mounted at /api/admin/crm (parent applies requireAdmin).
 */
import express from 'express';
import * as crm from '../services/crmContactsService.js';

const router = express.Router();

function sendError(res, err, req) {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[crm-contacts]', err);
  return res.status(status).json({
    success: false,
    error: {
      code: err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'ERROR'),
      message: err.message || 'Request failed.',
    },
    requestId: req.id,
  });
}

/** GET /contacts — all captured emails (optional listType, q) */
router.get('/contacts', async (req, res) => {
  try {
    const contacts = await crm.listCrmContacts({
      listType: req.query.listType || null,
      q: req.query.q || '',
      limit: req.query.limit,
    });
    res.json({ data: { contacts, items: contacts }, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

/** GET /contacts/overview — lists + summary */
router.get('/contacts/overview', async (req, res) => {
  try {
    const overview = await crm.getCrmContactsOverview();
    res.json({ data: overview, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

/** GET /email-lists — CRM list buckets */
router.get('/email-lists', async (req, res) => {
  try {
    const lists = await crm.listCrmEmailLists();
    res.json({ data: { lists }, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

/**
 * POST /contacts/sync — pull every User account email into Client Accounts list
 * (and service-request contact emails).
 */
router.post('/contacts/sync', async (req, res) => {
  try {
    const result = await crm.syncAllClientContacts();
    res.json({ data: result, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

/** POST /contacts — manual capture { email, name, userId?, source?, listType? } */
router.post('/contacts', async (req, res) => {
  try {
    const body = req.body || {};
    const contact = await crm.captureContactEmail({
      email: body.email,
      name: body.name,
      userId: body.userId || body.databaseId || null,
      source: body.source || 'admin_manual',
      listType: body.listType || (body.userId || body.databaseId ? 'client_accounts' : 'general'),
      role: body.role || null,
      accountStatus: body.accountStatus || null,
      metadata: body.metadata || {},
      throwOnError: true,
    });
    res.status(201).json({ data: { contact }, requestId: req.id });
  } catch (err) {
    sendError(res, err, req);
  }
});

export default router;
