/**
 * Admin customer-oversight API client — the unified one-customer view.
 * All calls require an authenticated admin (role === 'admin').
 */
import { liveApiRequest } from '../api.js';

export function getCustomerOverview(userId) {
  return liveApiRequest(`/admin/customers/${encodeURIComponent(userId)}/overview`);
}

export function getCustomerServices(userId) {
  return liveApiRequest(`/admin/customers/${encodeURIComponent(userId)}/services`);
}

export function getCustomerBilling(userId) {
  return liveApiRequest(`/admin/customers/${encodeURIComponent(userId)}/billing`);
}

export function getCustomerSupport(userId) {
  return liveApiRequest(`/admin/customers/${encodeURIComponent(userId)}/support`);
}

export function getCustomerOperations(userId) {
  return liveApiRequest(`/admin/customers/${encodeURIComponent(userId)}/operations`);
}

export function getCustomerActivity(userId, { limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return liveApiRequest(`/admin/customers/${encodeURIComponent(userId)}/activity?${qs}`);
}
