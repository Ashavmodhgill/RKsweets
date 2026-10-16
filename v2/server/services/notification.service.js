const crypto = require('node:crypto');
const Notification = require('../models/notification.model');
const Order = require('../models/order.model');
const Owner = require('../models/owner.model');

const MAX_NOTIFICATION_PAGE_SIZE = 50;

function notificationIdFor(deduplicationKey) {
  return crypto.createHash('sha256').update(deduplicationKey).digest('hex');
}

function logDeliveryFailure(error, orderId, eventType) {
  console.error('[notifications] delivery_failed', {
    orderId: String(orderId), eventType, errorType: error?.name || 'Error',
  });
}

function createNotificationService({ NotificationModel = Notification, OrderModel = Order, OwnerModel = Owner } = {}) {
  async function persistEvent(order, event) {
    const recipientId = event.recipientType === 'owner'
      ? (await OwnerModel.findOne({ ownerKey: 'primary' }).select('_id').lean())?._id
      : event.recipientId;
    if (!recipientId) {
      const error = new Error('Notification recipient is unavailable');
      error.name = 'MissingNotificationRecipientError';
      throw error;
    }

    const _id = notificationIdFor(event.eventKey);
    const values = {
      _id,
      deduplicationKey: event.eventKey,
      recipientType: event.recipientType,
      recipientId,
      eventType: event.eventType,
      title: event.title,
      message: event.message,
      relatedOrderId: order._id,
      readAt: null,
      ...(Number.isSafeInteger(event.orderToken) ? { orderToken: event.orderToken } : {}),
    };
    try {
      await NotificationModel.findOneAndUpdate(
        { _id }, { $setOnInsert: values },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: false },
      ).lean();
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existing = await NotificationModel.findById(_id).lean();
      if (!existing) throw error;
    }

    await OrderModel.updateOne({
      _id: order._id,
      notificationOutbox: { $elemMatch: { eventKey: event.eventKey, deliveredAt: null } },
    }, { $set: { 'notificationOutbox.$.deliveredAt': new Date() } });
    return true;
  }

  async function dispatchOrderOutbox(orderId) {
    let order;
    try {
      order = await OrderModel.findById(orderId).lean();
      if (!order) return;
      for (const event of order.notificationOutbox || []) {
        if (event.deliveredAt) continue;
        try { await persistEvent(order, event); } catch (error) { logDeliveryFailure(error, orderId, event.eventType); }
      }
    } catch (error) {
      logDeliveryFailure(error, orderId, 'order_outbox');
    }
  }

  async function dispatchPendingFor(recipientType, recipientId) {
    try {
      const match = { recipientType, deliveredAt: null };
      if (recipientType === 'customer') match.recipientId = recipientId;
      const orders = await OrderModel.find({ notificationOutbox: { $elemMatch: match } })
        .sort({ createdAt: 1 }).limit(100).lean();
      for (const order of orders) {
        for (const event of order.notificationOutbox || []) {
          if (event.deliveredAt || event.recipientType !== recipientType) continue;
          if (recipientType === 'customer' && String(event.recipientId) !== String(recipientId)) continue;
          try { await persistEvent(order, event); } catch (error) { logDeliveryFailure(error, order._id, event.eventType); }
        }
      }
    } catch (error) {
      logDeliveryFailure(error, recipientId || 'owner', 'pending_outbox');
    }
  }

  async function unreadCount(recipientType, recipientId) {
    await dispatchPendingFor(recipientType, recipientId);
    return NotificationModel.countDocuments({ recipientType, recipientId, readAt: null });
  }

  async function list(recipientType, recipientId, limit = MAX_NOTIFICATION_PAGE_SIZE) {
    await dispatchPendingFor(recipientType, recipientId);
    const boundedLimit = Math.max(1, Math.min(MAX_NOTIFICATION_PAGE_SIZE, limit));
    return NotificationModel.find({ recipientType, recipientId })
      .sort({ createdAt: -1, _id: -1 }).limit(boundedLimit)
      .select('_id eventType title message relatedOrderId orderToken readAt createdAt').lean();
  }

  async function markOneRead(recipientType, recipientId, notificationId) {
    return NotificationModel.findOneAndUpdate(
      { _id: notificationId, recipientType, recipientId, readAt: null },
      { $set: { readAt: new Date() } }, { new: true, runValidators: true },
    ).lean();
  }

  async function markAllRead(recipientType, recipientId) {
    const result = await NotificationModel.updateMany(
      { recipientType, recipientId, readAt: null }, { $set: { readAt: new Date() } },
    );
    return result.modifiedCount;
  }

  return { dispatchOrderOutbox, dispatchPendingFor, list, markAllRead, markOneRead, unreadCount };
}

const notificationService = createNotificationService();
module.exports = { MAX_NOTIFICATION_PAGE_SIZE, createNotificationService, notificationIdFor, ...notificationService };
