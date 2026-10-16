const mongoose = require('mongoose');
const { ORDER_STATUSES } = require('../constants/order-status');

const statusCountsSchema = new mongoose.Schema({
  pending_owner_acceptance: { type: Number, min: 0, default: 0 },
  accepted: { type: Number, min: 0, default: 0 },
  rejected: { type: Number, min: 0, default: 0 },
  preparing: { type: Number, min: 0, default: 0 },
  ready: { type: Number, min: 0, default: 0 },
  completed: { type: Number, min: 0, default: 0 },
  cancelled: { type: Number, min: 0, default: 0 },
}, { _id: false, strict: 'throw' });

const fulfilmentTotalsSchema = new mongoose.Schema({
  pickup: { type: new mongoose.Schema({ orderCount: Number, grossOrderValuePaise: Number }, { _id: false }), required: true },
  dine_in: { type: new mongoose.Schema({ orderCount: Number, grossOrderValuePaise: Number }, { _id: false }), required: true },
}, { _id: false, strict: 'throw' });
const issuedTokenSchema = new mongoose.Schema({
  tokenDate: { type: String, required: true, immutable: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  token: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
}, { _id: false, strict: 'throw' });

const reportSchema = new mongoose.Schema({
  businessDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  openedAt: { type: Date, required: true },
  closedAt: { type: Date, required: true },
  status: { type: String, required: true, enum: ['closed'] },
  totalOrderCount: { type: Number, required: true, min: 0 },
  statusCounts: { type: statusCountsSchema, required: true },
  acceptedOrderCount: { type: Number, required: true, min: 0 },
  rejectedOrderCount: { type: Number, required: true, min: 0 },
  completedOrderCount: { type: Number, required: true, min: 0 },
  grossOrderValuePaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  fulfilmentTotals: { type: fulfilmentTotalsSchema, required: true },
  officialTokens: { type: [issuedTokenSchema], default: [] },
  paidSalesStatus: { type: String, enum: ['not_recorded'], required: true },
  paidSalesPaise: { type: Number, default: null },
  paidSalesExcludedOrderCount: { type: Number, required: true, min: 0 },
}, { _id: false, strict: 'throw' });

const businessDaySchema = new mongoose.Schema({
  _id: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  businessDate: { type: String, required: true, immutable: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, required: true, enum: ['open', 'closing', 'closed'] },
  activeLockKey: { type: String, select: false },
  openedAt: { type: Date, required: true, immutable: true },
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner', required: true, immutable: true },
  closingRequestedAt: Date,
  closingRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner' },
  closedAt: Date,
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Owner' },
  workflowVersion: { type: Number, min: 0, default: 0 },
  report: { type: reportSchema, default: undefined },
}, { timestamps: true, strict: 'throw', collection: 'business_days' });

businessDaySchema.index({ businessDate: 1 }, { unique: true, name: 'unique_business_date' });
businessDaySchema.index({ activeLockKey: 1 }, { unique: true, sparse: true, name: 'one_active_business_day' });
businessDaySchema.index({ status: 1, businessDate: -1 }, { name: 'business_day_history' });

module.exports = mongoose.models.BusinessDay || mongoose.model('BusinessDay', businessDaySchema);
