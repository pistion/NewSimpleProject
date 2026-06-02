/**
 * notification.routes.js — user-facing notification endpoints.
 * Mounted at /api/notifications and /api/v1/notifications.
 *
 * All routes require a valid session. The admin create route additionally
 * requires the admin role. Normal users can only read/update/delete their own
 * (or audience 'all') notifications — enforced in the service visibility rules.
 */
import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import NotificationController from '../controllers/notification.controller.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', NotificationController.listMyNotifications);
router.get('/unread-count', NotificationController.getUnreadCount);
router.post('/read-all', NotificationController.markAllRead);
router.post('/:notificationId/read', NotificationController.markRead);
router.delete('/:notificationId', NotificationController.deleteNotification);

// Admin/system message creation — admin only.
router.post('/admin', requireAdmin, NotificationController.createAdminNotification);

export default router;
