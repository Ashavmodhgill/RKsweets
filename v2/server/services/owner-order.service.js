const mongoose = require('mongoose');
const Order = require('../models/order.model');
const BusinessDay = require('../models/business-day.model');
const OrderTokenCounter = require('../models/order-token-counter.model');
const { ORDER_STATUS, COMPLETABLE_ORDER_STATUSES } = require('../constants/order-status');
const { NOTIFICATION_EVENT, acceptedOrderEvents, customerOrderEvent } = require('../constants/notification-events');
const { businessDateFor, touchOpenBusinessDay, touchResolvableBusinessDay } = require('./business-day.service');

function suggestedPreparationMinutes(order) {
  return Math.max(0, ...order.items.map((item) => item.prepMinutes));
}

function conflictError() {
  const error = new Error('This order has already changed. Refresh to see its current status.');
  error.code = 'ORDER_TRANSITION_CONFLICT';
  return error;
}

async function getOrder(OrderModel, orderId, session) {
  let query = OrderModel.findById(orderId);
  if (session) query = query.session(session);
  return query.lean();
}

async function acceptOrder({ orderId, ownerId, confirmedPrepMinutes, adjustmentReason = '', timeZone, now = new Date(), OrderModel = Order, BusinessDayModel = BusinessDay, CounterModel = OrderTokenCounter, startSession = () => mongoose.startSession() }) {
  const tokenDate = businessDateFor(now, timeZone);
  const session = await startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const order = await getOrder(OrderModel, orderId, session);
      if (!order) {
        result = { order: null, transitioned: false };
        return;
      }
      if (order.status !== ORDER_STATUS.PENDING) {
        result = { order, transitioned: false };
        return;
      }
      await touchOpenBusinessDay({ date: order.businessDate || tokenDate, BusinessDayModel, session });
      const suggestion = suggestedPreparationMinutes(order);
      const reason = String(adjustmentReason || '').trim();
      if (confirmedPrepMinutes !== suggestion && !reason) {
        const error = new Error('Explain the preparation-time adjustment.');
        error.code = 'PREP_ADJUSTMENT_REASON_REQUIRED';
        throw error;
      }
      const counter = await CounterModel.findOneAndUpdate(
        { _id: tokenDate }, { $inc: { value: 1 } },
        // $inc initializes a missing value at 1; avoid a conflicting inserted default.
        { upsert: true, new: true, session, setDefaultsOnInsert: false },
      );
      const acceptanceEvents = acceptedOrderEvents({
        ...order,
        acceptedAt: now,
        officialToken: counter.value,
        tokenDate,
        confirmedPrepMinutes,
      });
      const updated = await OrderModel.findOneAndUpdate(
        { _id: orderId, status: ORDER_STATUS.PENDING },
        {
          $set: {
            status: ORDER_STATUS.ACCEPTED, acceptedAt: now, acceptedBy: ownerId,
            suggestedPrepMinutes: suggestion, confirmedPrepMinutes, prepTimeConfirmedAt: now,
            ...(confirmedPrepMinutes === suggestion ? { prepTimeAdjustmentReason: undefined } : { prepTimeAdjustmentReason: reason }),
            officialToken: counter.value, tokenDate,
          },
          $push: { notificationOutbox: { $each: acceptanceEvents } },
        },
        { new: true, runValidators: true, session },
      ).lean();
      if (!updated) throw conflictError();
      result = { order: updated, transitioned: true };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return result;
  } finally {
    await session.endSession();
  }
}

async function rejectOrder({ orderId, ownerId, reason, now = new Date(), OrderModel = Order, BusinessDayModel = BusinessDay, startSession = () => mongoose.startSession() }) {
  if (typeof reason !== 'string' || !reason.trim()) {
    const error = new Error('A rejection reason is required.');
    error.code = 'REJECTION_REASON_REQUIRED';
    throw error;
  }
  const session = await startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const prior = await getOrder(OrderModel, orderId, session);
      if (!prior || prior.status !== ORDER_STATUS.PENDING) { result = { order: prior, transitioned: false }; return; }
      await touchResolvableBusinessDay({ date: prior.businessDate, BusinessDayModel, session });
      const order = await OrderModel.findOneAndUpdate(
        { _id: orderId, status: ORDER_STATUS.PENDING },
        {
          $set: { status: ORDER_STATUS.REJECTED, rejectedAt: now, rejectedBy: ownerId, rejectionReason: reason.trim() },
          $push: { notificationOutbox: customerOrderEvent(prior, NOTIFICATION_EVENT.ORDER_REJECTED, 'Order update', `The owner rejected your order: ${reason.trim()}`, now) },
        }, { new: true, runValidators: true, session },
      ).lean();
      if (!order) throw conflictError();
      result = { order, transitioned: true };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return result;
  } finally { await session.endSession(); }
}

async function completeOrder({ orderId, ownerId, now = new Date(), OrderModel = Order, BusinessDayModel = BusinessDay, startSession = () => mongoose.startSession() }) {
  const session = await startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const prior = await getOrder(OrderModel, orderId, session);
      if (!prior || !COMPLETABLE_ORDER_STATUSES.includes(prior.status)) { result = { order: prior, transitioned: false }; return; }
      await touchResolvableBusinessDay({ date: prior.businessDate, BusinessDayModel, session });
      const order = await OrderModel.findOneAndUpdate(
        { _id: orderId, status: { $in: COMPLETABLE_ORDER_STATUSES } },
        {
          $set: { status: ORDER_STATUS.COMPLETED, completedAt: now, completedBy: ownerId },
          $push: { notificationOutbox: customerOrderEvent(prior, NOTIFICATION_EVENT.ORDER_COMPLETED, 'Order completed', 'The owner marked your order as completed. Payment is not recorded by this status.', now) },
        }, { new: true, runValidators: true, session },
      ).lean();
      if (!order) throw conflictError();
      result = { order, transitioned: true };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return result;
  } finally { await session.endSession(); }
}

module.exports = { acceptOrder, businessDateFor, completeOrder, rejectOrder, suggestedPreparationMinutes };
