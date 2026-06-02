/**
 * notificationService.js
 *
 * User-facing notifications (the Bell dropdown). This is SEPARATE from AuditLog,
 * which stays internal/system history and is never replaced by this.
 *
 * Visibility:
 *   - a normal user sees: their own (userId) + audience 'all'
 *   - an admin user sees:  their own (userId) + audience 'admin' + audience 'all'
 * Soft-delete only (deletedAt); user-deleted rows are never returned.
 *
 * All reads/writes are fail-soft: a missing table or DB hiccup logs and returns
 * an empty/zero result rather than 500-ing the whole app (the bell is non-critical).
 */
import { prisma } from './db.js';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;
const VALID_AUDIENCE = new Set(['user', 'admin', 'all']);

function safeParse(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

/** Real DB user id (the dev/local-user fallback has no row). */
function dbUserId(userId) {
  return userId && userId !== 'local-user' ? userId : null;
}

function view(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    actionUrl: n.actionUrl || null,
    entityType: n.entityType || null,
    entityId: n.entityId || null,
    audience: n.audience,
    metadata: safeParse(n.metadata),
    readAt: n.readAt || null,
    read: Boolean(n.readAt),
    createdAt: n.createdAt,
  };
}

// ── Create ──────────────────────────────────────────────────────────────────

/**
 * Create a notification. Best-effort: never throws into the caller's flow
 * (deploy/billing events must not fail because a notification couldn't be saved).
 */
export async function createNotification({
  userId = null,
  audience = 'user',
  type = 'info',
  title,
  message,
  actionUrl = null,
  entityType = null,
  entityId = null,
  metadata = {},
} = {}) {
  try {
    if (!title || !message) return null;
    const aud = VALID_AUDIENCE.has(String(audience)) ? String(audience) : 'user';
    return await prisma.notification.create({
      data: {
        userId: dbUserId(userId),
        audience: aud,
        type: String(type || 'info'),
        title: String(title).slice(0, 200),
        message: String(message).slice(0, 1000),
        actionUrl: actionUrl ? String(actionUrl).slice(0, 500) : null,
        entityType: entityType ? String(entityType).slice(0, 80) : null,
        entityId: entityId ? String(entityId).slice(0, 120) : null,
        metadata: JSON.stringify(metadata || {}),
      },
    });
  } catch (err) {
    console.error('[notifications] create failed:', err.message);
    return null;
  }
}

/** Create a notification targeted at a specific user. */
export function createUserNotification(userId, payload = {}) {
  if (!dbUserId(userId)) return Promise.resolve(null);
  return createNotification({ ...payload, userId, audience: 'user' });
}

/** Create an admin-audience notification (visible to all admins). */
export function createAdminNotification(payload = {}) {
  return createNotification({ ...payload, userId: null, audience: 'admin' });
}

/** Create an all-audience system notification (visible to everyone). */
export function createSystemNotification(payload = {}) {
  return createNotification({ ...payload, userId: null, audience: 'all' });
}

// ── Read ────────────────────────────────────────────────────────────────────

/** Prisma `where` clause for what a given user is allowed to see. */
function visibilityWhere(user) {
  const id = dbUserId(user?.id);
  const isAdmin = user?.role === 'admin';
  const or = [{ audience: 'all' }];
  if (id) or.push({ userId: id });
  if (isAdmin) or.push({ audience: 'admin' });
  return { deletedAt: null, OR: or };
}

export async function listNotifications({ user, unreadOnly = false, limit = DEFAULT_LIMIT, cursor = null } = {}) {
  try {
    const take = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
    const where = visibilityWhere(user);
    if (unreadOnly) where.readAt = null;
    const rows = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return { items: page.map(view), nextCursor: hasMore ? page[page.length - 1].id : null };
  } catch (err) {
    console.error('[notifications] list failed:', err.message);
    return { items: [], nextCursor: null };
  }
}

export async function getUnreadCount(user) {
  try {
    const where = visibilityWhere(user);
    where.readAt = null;
    return await prisma.notification.count({ where });
  } catch (err) {
    console.error('[notifications] unread count failed:', err.message);
    return 0;
  }
}

// ── Update / delete ─────────────────────────────────────────────────────────

/** Mark one notification read — only if the caller is allowed to see it. */
export async function markNotificationRead({ user, notificationId }) {
  try {
    const where = visibilityWhere(user);
    where.id = notificationId;
    const result = await prisma.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
  } catch (err) {
    console.error('[notifications] markRead failed:', err.message);
    return { updated: 0 };
  }
}

export async function markAllNotificationsRead({ user }) {
  try {
    const where = visibilityWhere(user);
    where.readAt = null;
    const result = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
    return { updated: result.count };
  } catch (err) {
    console.error('[notifications] markAll failed:', err.message);
    return { updated: 0 };
  }
}

/** Soft-delete one notification (caller must be allowed to see it). */
export async function deleteNotification({ user, notificationId }) {
  try {
    const where = visibilityWhere(user);
    where.id = notificationId;
    const result = await prisma.notification.updateMany({ where, data: { deletedAt: new Date() } });
    return { deleted: result.count };
  } catch (err) {
    console.error('[notifications] delete failed:', err.message);
    return { deleted: 0 };
  }
}

export default {
  createNotification,
  createUserNotification,
  createAdminNotification,
  createSystemNotification,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
};
