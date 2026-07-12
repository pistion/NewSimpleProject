/**
 * tickets.routes.js — customer ticket API + admin ticket management.
 *
 * Customer routes:  POST/GET /api/v1/tickets/*  (authMiddleware)
 * Admin routes:     GET/POST /api/admin/tickets/* (protected by admin.routes.js)
 *   — admin routes are consumed by admin.routes.js via import
 */

import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { ticketReadRateLimit, ticketWriteRateLimit } from '../middleware/rateLimit.middleware.js';
import {
  createTicket, listUserTickets, getTicket,
  addTicketMessage, listAllTickets, adminUpdateTicket,
  markTicketSeen, getCustomerUnreadCount, getAdminUnreadCount,
} from '../services/ticketService.js';

// ── Customer router ───────────────────────────────────────────────────────────

export const customerTicketRouter = express.Router();
customerTicketRouter.use(authMiddleware);

customerTicketRouter.post('/', ticketWriteRateLimit, async (req, res, next) => {
  try {
    const ticket = await createTicket(req.user.id, req.body);
    res.status(201).json({ data: ticket });
  } catch (err) { next(err); }
});

customerTicketRouter.get('/', ticketReadRateLimit, async (req, res, next) => {
  try {
    const result = await listUserTickets(req.user.id, req.query);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// Unread admin replies across all of the caller's tickets (sidebar badge).
// Must be registered before '/:ticketId'.
customerTicketRouter.get('/unread-count', ticketReadRateLimit, async (req, res, next) => {
  try {
    res.json({ data: await getCustomerUnreadCount(req.user.id) });
  } catch (err) { next(err); }
});

customerTicketRouter.get('/:ticketId', ticketReadRateLimit, async (req, res, next) => {
  try {
    const ticket = await getTicket(req.params.ticketId, req.user.id);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

customerTicketRouter.post('/:ticketId/messages', ticketWriteRateLimit, async (req, res, next) => {
  try {
    const msg = await addTicketMessage(req.params.ticketId, req.user.id, req.body.body);
    res.status(201).json({ data: msg });
  } catch (err) { next(err); }
});

// Customer opened the conversation: admin messages become seen, own unread resets.
customerTicketRouter.post('/:ticketId/seen', ticketReadRateLimit, async (req, res, next) => {
  try {
    res.json({ data: await markTicketSeen(req.params.ticketId, req.user.id, false) });
  } catch (err) { next(err); }
});

// ── Admin router (mounted inside admin.routes.js) ─────────────────────────────
// Note: admin.routes.js already applies authMiddleware + requireAdmin at the
// router level, so no additional auth middleware is needed here.

export const adminTicketRouter = express.Router();

adminTicketRouter.get('/', async (req, res, next) => {
  try {
    const result = await listAllTickets(req.query);
    res.json({ data: result });
  } catch (err) { next(err); }
});

// Unread customer messages across all tickets (admin tab badge).
// Must be registered before '/:ticketId'.
adminTicketRouter.get('/unread-count', async (req, res, next) => {
  try {
    res.json({ data: await getAdminUnreadCount() });
  } catch (err) { next(err); }
});

adminTicketRouter.get('/:ticketId', async (req, res, next) => {
  try {
    const ticket = await getTicket(req.params.ticketId, req.user.id, true);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

// Admin opened the conversation: customer messages become seen, admin unread resets.
adminTicketRouter.post('/:ticketId/seen', async (req, res, next) => {
  try {
    res.json({ data: await markTicketSeen(req.params.ticketId, req.user.id, true) });
  } catch (err) { next(err); }
});

adminTicketRouter.post('/:ticketId/reply', async (req, res, next) => {
  try {
    const msg = await addTicketMessage(req.params.ticketId, req.user.id, req.body.body, true);
    res.status(201).json({ data: msg });
  } catch (err) { next(err); }
});

adminTicketRouter.patch('/:ticketId', async (req, res, next) => {
  try {
    const ticket = await adminUpdateTicket(req.params.ticketId, req.user.id, req.body);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});
