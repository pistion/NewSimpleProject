/**
 * tickets.routes.js — customer ticket API + admin ticket management.
 *
 * Customer routes:  POST/GET /api/v1/tickets/*  (authMiddleware)
 * Admin routes:     GET/POST /api/admin/tickets/* (protected by admin.routes.js)
 *   — admin routes are consumed by admin.routes.js via import
 */

import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { ticketRateLimit } from '../middleware/rateLimit.middleware.js';
import {
  createTicket, listUserTickets, getTicket,
  addTicketMessage, listAllTickets, adminUpdateTicket,
} from '../services/ticketService.js';

// ── Customer router ───────────────────────────────────────────────────────────

export const customerTicketRouter = express.Router();
customerTicketRouter.use(authMiddleware, ticketRateLimit);

customerTicketRouter.post('/', async (req, res, next) => {
  try {
    const ticket = await createTicket(req.user.id, req.body);
    res.status(201).json({ data: ticket });
  } catch (err) { next(err); }
});

customerTicketRouter.get('/', async (req, res, next) => {
  try {
    const result = await listUserTickets(req.user.id, req.query);
    res.json({ data: result });
  } catch (err) { next(err); }
});

customerTicketRouter.get('/:ticketId', async (req, res, next) => {
  try {
    const ticket = await getTicket(req.params.ticketId, req.user.id);
    res.json({ data: ticket });
  } catch (err) { next(err); }
});

customerTicketRouter.post('/:ticketId/messages', async (req, res, next) => {
  try {
    const msg = await addTicketMessage(req.params.ticketId, req.user.id, req.body.body);
    res.status(201).json({ data: msg });
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

adminTicketRouter.get('/:ticketId', async (req, res, next) => {
  try {
    const ticket = await getTicket(req.params.ticketId, req.user.id, true);
    res.json({ data: ticket });
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
