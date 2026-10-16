const mongoose = require('mongoose');
const { ORDER_STATUS, ORDER_STATUSES } = require('../constants/order-status');
const { NOTIFICATION_EVENTS } = require('../constants/notification-events');

const orderNotificationOutboxSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, immutable: true },
  recipientType: { type: String, required: true, enum: ['owner', 'customer'], immutable: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, immutable: true },
  eventType: { type: String, required: true, enum: NOTIFICATION_EVENTS, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  message: { type: String, required: true, trim: true, maxlength: 500, immutable: true },
  orderToken: { type: Number, min: 1, validate: Number.isSafeInteger, immutable: true },
  createdAt: { type: Date, required: true, immutable: true },
  deliveredAt: { type: Date, default: null },
}, { _id: false, strict: 'throw' });

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  unitType: { type: String, required: true, enum: ['piece', 'weight'], immutable: true },
  unitLabel: { type: String, required: true, maxlength: 40, immutable: true },
  quantity: { type: Number, required: true, min: 1, max: 99, validate: Number.isSafeInteger, immutable: true },
  unitPricePaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  lineTotalPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  prepMinutes: { type: Number, required: true, min: 0, max: 1440, validate: Number.isSafeInteger, immutable: true },
}, { _id: false, strict: 'throw' });

const orderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
  customerSnapshot: {
    type: new mongoose.Schema({
      name: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
      mobile: { type: String, required: true, immutable: true },
    }, { _id: false, strict: 'throw' }),
    required: true,
    immutable: true,
  },
  businessDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, immutable: true },
  items: { type: [orderItemSchema], required: true, validate: (items) => items.length > 0, immutable: true },
  fulfillmentMethod: { type: String, required: true, enum: ['pickup', 'dine_in'], immutable: true },
  tableSnapshot: {
    type: new mongoose.Schema({
      tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'DiningTable', required: true, immutable: true },
      tableNumber: { type: String, required: true, maxlength: 32, immutable: true },
    }, { _id: false, strict: 'throw' }),
    default: undefined,
    immutable: true,
  },
  totalPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  paymentMethod: { type: String, required: true, enum: ['in_person'], immutable: true },
  status: {
    type: String,
    required: true,
    enum: ORDER_STATUSES,
    default: ORDER_STATUS.PENDING,
  },
  // These fields are set only by atomic, status-guarded owner transitions.
  acceptedAt: { type: Date },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner' },
  suggestedPrepMinutes: { type: Number, min: 0, max: 1440, validate: Number.isSafeInteger },
  confirmedPrepMinutes: { type: Number, min: 0, max: 1440, validate: Number.isSafeInteger },
  prepTimeConfirmedAt: { type: Date },
  prepTimeAdjustmentReason: { type: String, trim: true, maxlength: 300 },
  officialToken: { type: Number, min: 1, validate: Number.isSafeInteger },
  tokenDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  rejectedAt: { type: Date },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner' },
  rejectionReason: { type: String, trim: true, maxlength: 500 },
  completedAt: { type: Date },
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner' },
  notificationOutbox: { type: [orderNotificationOutboxSchema], default: [] },
}, { timestamps: true, strict: 'throw' });

orderSchema.index({ customerId: 1, createdAt: -1 }, { name: 'customer_order_history' });
orderSchema.index({ tokenDate: 1, officialToken: 1 }, {
  unique: true,
  partialFilterExpression: { officialToken: { $exists: true } },
  name: 'unique_daily_official_order_token',
});
orderSchema.index({ status: 1, createdAt: -1 }, { name: 'owner_order_queue' });
orderSchema.index({ businessDate: 1, status: 1, createdAt: 1 }, { name: 'business_day_order_report' });
orderSchema.index({
  'notificationOutbox.recipientType': 1,
  'notificationOutbox.recipientId': 1,
  'notificationOutbox.deliveredAt': 1,
}, { name: 'pending_order_notification_outbox' });

orderSchema.pre('validate', function validateOwnerDecision() {
  const hasToken = Number.isSafeInteger(this.officialToken) && this.officialToken > 0 && Boolean(this.tokenDate);
  const isAcceptedStatus = [ORDER_STATUS.ACCEPTED, ORDER_STATUS.PREPARING, ORDER_STATUS.READY, ORDER_STATUS.COMPLETED]
    .includes(this.status);
  if (isAcceptedStatus && (!hasToken || !this.acceptedAt || !this.acceptedBy
    || !Number.isSafeInteger(this.suggestedPrepMinutes)
    || !Number.isSafeInteger(this.confirmedPrepMinutes)
    || !this.prepTimeConfirmedAt)) {
    this.invalidate('status', 'Accepted orders require their acceptance details and daily token.');
  }
  if (this.status === ORDER_STATUS.REJECTED && (!this.rejectedAt || !this.rejectedBy || !this.rejectionReason?.trim())) {
    this.invalidate('status', 'Rejected orders require an owner reason and timestamp.');
  }
  if (this.status === ORDER_STATUS.COMPLETED && !this.completedAt) {
    this.invalidate('status', 'Completed orders require a completion timestamp.');
  }
});

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema, 'orders');
