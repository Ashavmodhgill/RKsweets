const notificationService = require('../services/notification.service');

function createNotificationController(recipientType) {
  function recipientId(req) { return req.authAccount._id; }
  function wantsJson(req) { return req.accepts(['html', 'json']) === 'json'; }

  async function show(req, res, next) {
    try {
      const notifications = await notificationService.list(recipientType, recipientId(req));
      return res.render(`${recipientType === 'owner' ? 'admin' : 'customer'}/views/pages/notifications`, {
        pageTitle: 'Notifications', account: req.authAccount,
        notifications: notifications.map((notification) => ({
          ...notification,
          orderUrl: `/orders/${notification.relatedOrderId}`,
        })),
      });
    } catch (error) { return next(error); }
  }

  async function feed(req, res, next) {
    try {
      const notifications = await notificationService.list(recipientType, recipientId(req), req.validated.query.limit);
      return res.json({ notifications: notifications.map((notification) => ({
        id: notification._id,
        title: notification.title,
        message: notification.message,
        createdAt: notification.createdAt,
        unread: notification.readAt === null,
        orderUrl: `/orders/${notification.relatedOrderId}`,
      })) });
    } catch (error) { return next(error); }
  }

  async function unreadCount(req, res, next) {
    try {
      const count = await notificationService.unreadCount(recipientType, recipientId(req));
      return res.json({ unreadCount: count });
    } catch (error) { return next(error); }
  }

  async function markOneRead(req, res, next) {
    try {
      const notification = await notificationService.markOneRead(
        recipientType, recipientId(req), req.validated.params.notificationId,
      );
      if (!notification) return wantsJson(req)
        ? res.status(404).json({ error: { message: 'Notification not found.' } })
        : res.redirect(303, '/notifications?notice=not-found');
      return wantsJson(req) ? res.json({ ok: true }) : res.redirect(303, '/notifications');
    } catch (error) { return next(error); }
  }

  async function markAllRead(req, res, next) {
    try {
      const modified = await notificationService.markAllRead(recipientType, recipientId(req));
      return wantsJson(req) ? res.json({ ok: true, modified }) : res.redirect(303, '/notifications');
    } catch (error) { return next(error); }
  }

  return { feed, markAllRead, markOneRead, show, unreadCount };
}

module.exports = { createNotificationController };
