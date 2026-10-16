const mongoose = require('mongoose');
const Order = require('../models/order.model');
const OrderTokenCounter = require('../models/order-token-counter.model');
const { ORDER_STATUS, COMPLETABLE_ORDER_STATUSES } = require('../constants/order-status');

function businessDateFor(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

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

async function acceptOrder({ orderId, ownerId, confirmedPrepMinutes, adjustmentReason = '', timeZone, now = new Date(), OrderModel = Order, CounterModel = OrderTokenCounter, startSession = () => mongoose.startSession() }) {
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
      const updated = await OrderModel.findOneAndUpdate(
        { _id: orderId, status: ORDER_STATUS.PENDING },
        { $set: {
          status: ORDER_STATUS.ACCEPTED, acceptedAt: now, acceptedBy: ownerId,
          suggestedPrepMinutes: suggestion, confirmedPrepMinutes, prepTimeConfirmedAt: now,
          ...(confirmedPrepMinutes === suggestion ? { prepTimeAdjustmentReason: undefined } : { prepTimeAdjustmentReason: reason }),
          officialToken: counter.value, tokenDate,
        } },
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

async function rejectOrder({ orderId, ownerId, reason, now = new Date(), OrderModel = Order }) {
  if (typeof reason !== 'string' || !reason.trim()) {
    const error = new Error('A rejection reason is required.');
    error.code = 'REJECTION_REASON_REQUIRED';
    throw error;
  }
  const order = await OrderModel.findOneAndUpdate(
    { _id: orderId, status: ORDER_STATUS.PENDING },
    { $set: { status: ORDER_STATUS.REJECTED, rejectedAt: now, rejectedBy: ownerId, rejectionReason: reason.trim() } },
    { new: true, runValidators: true },
  ).lean();
  return order ? { order, transitioned: true } : { order: await OrderModel.findById(orderId).lean(), transitioned: false };
}

async function completeOrder({ orderId, ownerId, now = new Date(), OrderModel = Order }) {
  const order = await OrderModel.findOneAndUpdate(
    { _id: orderId, status: { $in: COMPLETABLE_ORDER_STATUSES } },
    { $set: { status: ORDER_STATUS.COMPLETED, completedAt: now, completedBy: ownerId } },
    { new: true, runValidators: true },
  ).lean();
  return order ? { order, transitioned: true } : { order: await OrderModel.findById(orderId).lean(), transitioned: false };
}

module.exports = { acceptOrder, businessDateFor, completeOrder, rejectOrder, suggestedPreparationMinutes };
