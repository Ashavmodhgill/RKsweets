const mongoose = require('mongoose');
const { NOTIFICATION_EVENTS } = require('../constants/notification-events');

const notificationSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  deduplicationKey: { type: String, required: true, immutable: true },
  recipientType: { type: String, required: true, enum: ['owner', 'customer'], immutable: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  eventType: { type: String, required: true, enum: NOTIFICATION_EVENTS, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  message: { type: String, required: true, trim: true, maxlength: 500, immutable: true },
  relatedOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, immutable: true },
  orderToken: { type: Number, min: 1, validate: Number.isSafeInteger, immutable: true },
  readAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw', collection: 'notifications' });

notificationSchema.index({ deduplicationKey: 1 }, { unique: true, name: 'unique_notification_event' });
notificationSchema.index({ recipientType: 1, recipientId: 1, readAt: 1, createdAt: -1 }, { name: 'recipient_unread_notifications' });
notificationSchema.index({ recipientType: 1, recipientId: 1, createdAt: -1 }, { name: 'recipient_notification_history' });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
