/**
 * Billing API client — deploy-first K100 billing summary.
 */
import { liveApiRequest } from '../api.js';
import { getStoredAuth } from './auth.js';

/**
 * The deploy-first billing summary for the signed-in user:
 *   { pricing, orders, deployments, provider }
 *
 * The backend route is workspace-scoped, but the summary is filtered by the
 * authenticated user, not the workspace id — so the stored organization id (or
 * a placeholder) is sufficient.
 */
export function getBillingSummary() {
  const workspaceId = getStoredAuth()?.organizationId || 'me';
  return liveApiRequest(`/v1/workspaces/${encodeURIComponent(workspaceId)}/billing/summary`);
}

/** Admin-only: all-tenant billing overview. Caller must be an admin. */
export function getAdminBillingOverview() {
  return liveApiRequest('/admin/overview');
}
