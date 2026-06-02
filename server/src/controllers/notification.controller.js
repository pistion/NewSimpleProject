/**
 * notification.controller.js — user-facing notifications (the Bell dropdown).
 * All routes are authenticated; the admin-create route is additionally gated.
 */
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  createNotification,
} from '../services/notificationService.js';

const NotificationController = {
  listMyNotifications: async (req, res, next) => {
    try {
      const unreadOnly = String(req.query?.unread || '').toLowerCase() === 'true';
      const limit = req.query?.limit;
      const cursor = req.query?.cursor || null;
      const data = await listNotifications({ user: req.user, unreadOnly, limit, cursor });
      res.ok(data);
    } catch (error) { next ? next(error) : res.error('NOTIFICATION_ERROR', error.message, 500); }
  },

  getUnreadCount: async (req, res, next) => {
    try {
      const count = await getUnreadCount(req.user);
      res.ok({ count });
    } catch (error) { next ? next(error) : res.error('NOTIFICATION_ERROR', error.message, 500); }
  },

  markRead: async (req, res, next) => {
    try {
      const result = await markNotificationRead({ user: req.user, notificationId: req.params.notificationId });
      res.ok(result);
    } catch (error) { next ? next(error) : res.error('NOTIFICATION_ERROR', error.message, 500); }
  },

  markAllRead: async (req, res, next) => {
    try {
      const result = await markAllNotificationsRead({ user: req.user });
      res.ok(result);
    } catch (error) { next ? next(error) : res.error('NOTIFICATION_ERROR', error.message, 500); }
  },

  deleteNotification: async (req, res, next) => {
    try {
      const result = await deleteNotification({ user: req.user, notificationId: req.params.notificationId });
      res.ok(result);
    } catch (error) { next ? next(error) : res.error('NOTIFICATION_ERROR', error.message, 500); }
  },

  // Admin/system create — gated by requireAdmin at the route level.
  createAdminNotification: async (req, res, next) => {
    try {
      const b = req.body || {};
      if (!b.title || !b.message) {
        return res.error('NOTIFICATION_INVALID', 'title and message are required.', 400);
      }
      const created = await createNotification({
        userId: b.userId || null,
        audience: b.audience || (b.userId ? 'user' : 'admin'),
        type: b.type || 'info',
        title: b.title,
        message: b.message,
        actionUrl: b.actionUrl || null,
        entityType: b.entityType || null,
        entityId: b.entityId || null,
        metadata: b.metadata || {},
      });
      if (!created) return res.error('NOTIFICATION_FAILED', 'Could not create notification.', 500);
      res.created({ id: created.id });
    } catch (error) { next ? next(error) : res.error('NOTIFICATION_ERROR', error.message, 500); }
  },

  // ── Back-compat alias for the (feature-gated) settings.routes mount ─────────
  listNotifications: async (req, res, next) => NotificationController.listMyNotifications(req, res, next),
};

export default NotificationController;
