/**
 * Admin tickets API client — support conversation management.
 * All calls require an authenticated admin (role === 'admin').
 */
import { liveApiRequest } from '../api.js';

export function listAdminTickets({ status, category, priority, userId, limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (category) qs.set('category', category);
  if (priority) qs.set('priority', priority);
  if (userId) qs.set('userId', userId);
  if (limit) qs.set('limit', String(limit));
  if (offset) qs.set('offset', String(offset));
  return liveApiRequest(`/admin/tickets?${qs.toString()}`);
}

export function getAdminTicket(ticketId) {
  return liveApiRequest(`/admin/tickets/${encodeURIComponent(ticketId)}`);
}

export function replyAdminTicket(ticketId, body) {
  return liveApiRequest(`/admin/tickets/${encodeURIComponent(ticketId)}/reply`, {
    method: 'POST',
    body: { body },
  });
}

/** Update status / priority / assignment (resolve, close, reopen…). */
export function updateAdminTicket(ticketId, patch) {
  return liveApiRequest(`/admin/tickets/${encodeURIComponent(ticketId)}`, {
    method: 'PATCH',
    body: patch,
  });
}

/** Mark customer messages seen + reset the admin unread counter. */
export function markAdminTicketSeen(ticketId) {
  return liveApiRequest(`/admin/tickets/${encodeURIComponent(ticketId)}/seen`, { method: 'POST' });
}

/** Unread customer messages across all tickets — admin tab badge. */
export function getAdminTicketsUnreadCount() {
  return liveApiRequest('/admin/tickets/unread-count');
}
