/**
 * vpsAction.repository.js
 *
 * Database gateway for VpsActionLog — the per-mutation operation/audit record.
 * Long-running commands create a pending action first, then mark it success or
 * failure; simple one-shot mutations can record a completed action directly.
 *
 * Writes accept an optional `tx` so they can join the vps repository's
 * transactions.
 */

import { prisma } from '../services/db.js';

function json(value) {
  try { return JSON.stringify(value ?? {}); } catch { return '{}'; }
}

/** Create an action record (default status: pending). */
export async function createAction({
  vpsServiceId,
  organizationId,
  actorUserId = null,
  action,
  status = 'pending',
  request = {},
  response = {},
}, tx = prisma) {
  return tx.vpsActionLog.create({
    data: {
      vpsServiceId,
      organizationId,
      actorUserId: actorUserId || null,
      action,
      status,
      request: json(request),
      response: json(response),
    },
  });
}

/** One-shot success record for simple mutations. Never throws. */
export async function recordCompletedAction(fields) {
  try {
    return await createAction({ ...fields, status: 'success' });
  } catch (err) {
    console.warn('[vps] Failed to write action log:', err.message);
    return null;
  }
}

export async function markActionSuccess(id, response = {}, tx = prisma) {
  return tx.vpsActionLog.update({
    where: { id },
    data: { status: 'success', response: json(response) },
  });
}

export async function markActionFailed(id, errorMessage, response = {}, tx = prisma) {
  return tx.vpsActionLog.update({
    where: { id },
    data: { status: 'error', errorMessage: String(errorMessage ?? 'unknown'), response: json(response) },
  });
}

/**
 * Record the outcome of a compensation attempt (e.g. deleting a provider
 * instance after a DB failure) on the originating action. Never throws —
 * compensation reporting must not mask the original error.
 */
export async function recordCompensationResult(id, { compensated, providerInstanceId, error = null }) {
  try {
    return await prisma.vpsActionLog.update({
      where: { id },
      data: {
        status: compensated ? 'compensated' : 'compensation_failed',
        response: json({ compensated, providerInstanceId, error: error ? String(error) : null }),
      },
    });
  } catch (err) {
    console.error('[vps] Failed to record compensation result:', err.message);
    return null;
  }
}
