const mongoose = require('mongoose');
const BusinessDay = require('../models/business-day.model');
const Order = require('../models/order.model');
const { ORDER_STATUS, ORDER_STATUSES } = require('../constants/order-status');

const UNRESOLVED_STATUSES = Object.freeze([
  ORDER_STATUS.PENDING, ORDER_STATUS.ACCEPTED, ORDER_STATUS.PREPARING, ORDER_STATUS.READY,
]);

function businessDateFor(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dayError(code, message, statusCode = 409) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function dayQuery(Model, date, session) {
  let query = Model.findById(date);
  if (session) query = query.session(session);
  return query.lean();
}

async function touchOpenBusinessDay({ date, BusinessDayModel = BusinessDay, session }) {
  const day = await BusinessDayModel.findOneAndUpdate(
    { _id: date, status: 'open' },
    { $inc: { workflowVersion: 1 } },
    { new: true, session, runValidators: true },
  ).lean();
  if (!day) throw dayError('BUSINESS_DAY_NOT_OPEN', 'Ordering and acceptance are closed until the owner opens the business day.');
  return day;
}

async function touchResolvableBusinessDay({ date, BusinessDayModel = BusinessDay, session }) {
  if (!date) return null;
  const day = await BusinessDayModel.findOneAndUpdate(
    { _id: date, status: { $in: ['open', 'closing'] } },
    { $inc: { workflowVersion: 1 } },
    { new: true, session, runValidators: true },
  ).lean();
  if (!day) throw dayError('BUSINESS_DAY_FINALIZED', 'This business day is finalized, so its orders can no longer be changed.');
  return day;
}

function buildReport(day, orders, closedAt) {
  const statusCounts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
  const fulfilmentTotals = {
    pickup: { orderCount: 0, grossOrderValuePaise: 0 },
    dine_in: { orderCount: 0, grossOrderValuePaise: 0 },
  };
  let grossOrderValuePaise = 0;
  const officialTokens = [];
  for (const order of orders) {
    if (Object.hasOwn(statusCounts, order.status)) statusCounts[order.status] += 1;
    if (!Number.isSafeInteger(order.totalPaise) || order.totalPaise < 0) {
      throw dayError('BUSINESS_DAY_REPORT_INVALID', 'A saved order total is invalid; the day report cannot be finalized.', 500);
    }
    grossOrderValuePaise += order.totalPaise;
    if (!Number.isSafeInteger(grossOrderValuePaise)) {
      throw dayError('BUSINESS_DAY_REPORT_INVALID', 'The report total exceeds the supported safe range.', 500);
    }
    const fulfilment = fulfilmentTotals[order.fulfillmentMethod];
    if (fulfilment) {
      fulfilment.orderCount += 1;
      fulfilment.grossOrderValuePaise += order.totalPaise;
      if (!Number.isSafeInteger(fulfilment.grossOrderValuePaise)) {
        throw dayError('BUSINESS_DAY_REPORT_INVALID', 'A fulfilment total exceeds the supported safe range.', 500);
      }
    }
    if (Number.isSafeInteger(order.officialToken) && order.officialToken > 0 && order.tokenDate) {
      officialTokens.push({ tokenDate: order.tokenDate, token: order.officialToken });
    }
  }
  officialTokens.sort((a, b) => a.tokenDate.localeCompare(b.tokenDate) || a.token - b.token);
  return {
    businessDate: day.businessDate,
    openedAt: day.openedAt,
    closedAt,
    status: 'closed',
    totalOrderCount: orders.length,
    statusCounts,
    acceptedOrderCount: statusCounts.accepted + statusCounts.preparing + statusCounts.ready + statusCounts.completed,
    rejectedOrderCount: statusCounts.rejected,
    completedOrderCount: statusCounts.completed,
    grossOrderValuePaise,
    fulfilmentTotals,
    officialTokens,
    paidSalesStatus: 'not_recorded',
    paidSalesPaise: null,
    paidSalesExcludedOrderCount: orders.length,
  };
}

async function openBusinessDay({ date, ownerId, now = new Date(), BusinessDayModel = BusinessDay, OrderModel = Order, startSession = () => mongoose.startSession() }) {
  const session = await startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const current = await BusinessDayModel.findOne({ status: { $in: ['open', 'closing'] } }).session(session).lean();
      if (current) throw dayError('BUSINESS_DAY_ALREADY_ACTIVE', `Business day ${current.businessDate} is ${current.status}.`);

      const unresolvedPrior = await OrderModel.findOne({
        status: { $in: UNRESOLVED_STATUSES },
        $or: [{ businessDate: { $lt: date } }, { businessDate: { $exists: false } }, { businessDate: null }],
      }).session(session).lean();
      if (unresolvedPrior) throw dayError('BUSINESS_DAY_PRIOR_ORDERS', 'Resolve outstanding orders from an earlier business day before opening this day.');

      const existing = await dayQuery(BusinessDayModel, date, session);
      if (existing) {
        if (existing.status === 'closed') throw dayError('BUSINESS_DAY_CLOSED', 'This business date has already been closed and cannot be reopened.');
        throw dayError('BUSINESS_DAY_ALREADY_ACTIVE', 'This business day has already been opened.');
      }
      const [created] = await BusinessDayModel.create([{
        _id: date, businessDate: date, status: 'open', activeLockKey: 'active', openedAt: now,
        openedBy: ownerId, workflowVersion: 0,
      }], { session });
      result = { day: created.toObject ? created.toObject() : created, created: true };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return result;
  } catch (error) {
    if (error?.code === 11000) {
      throw dayError('BUSINESS_DAY_ALREADY_ACTIVE', 'A business day was opened concurrently. Refresh to see its current status.');
    }
    throw error;
  } finally { await session.endSession(); }
}

async function requestBusinessDayClosing({ date, ownerId, now = new Date(), BusinessDayModel = BusinessDay }) {
  const changed = await BusinessDayModel.findOneAndUpdate(
    { _id: date, status: 'open' },
    { $set: { status: 'closing', closingRequestedAt: now, closingRequestedBy: ownerId } },
    { new: true, runValidators: true },
  ).lean();
  if (changed) return { day: changed, transitioned: true };
  const current = await BusinessDayModel.findById(date).lean();
  if (current?.status === 'closing') return { day: current, transitioned: false };
  if (current?.status === 'closed') throw dayError('BUSINESS_DAY_CLOSED', 'This business day is already finalized.');
  throw dayError('BUSINESS_DAY_NOT_OPEN', 'There is no open business day to close.');
}

async function finalizeBusinessDay({ date, ownerId, now = new Date(), BusinessDayModel = BusinessDay, OrderModel = Order, startSession = () => mongoose.startSession() }) {
  const session = await startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const day = await dayQuery(BusinessDayModel, date, session);
      if (!day) throw dayError('BUSINESS_DAY_NOT_FOUND', 'Business day not found.', 404);
      if (day.status === 'closed' && day.report) { result = { day, finalized: false, alreadyClosed: true, outstanding: [] }; return; }
      if (day.status !== 'closing') throw dayError('BUSINESS_DAY_NOT_CLOSING', 'Request closing before finalizing the day.');

      const lockedDay = await BusinessDayModel.findOneAndUpdate(
        { _id: date, status: 'closing' }, { $inc: { workflowVersion: 1 } },
        { new: true, session, runValidators: true },
      ).lean();
      if (!lockedDay) throw dayError('BUSINESS_DAY_FINALIZE_CONFLICT', 'The business day changed while finalizing. Refresh and retry.');

      const outstanding = await OrderModel.find({ businessDate: date, status: { $in: UNRESOLVED_STATUSES } })
        .sort({ createdAt: 1, _id: 1 }).session(session).lean();
      if (outstanding.length) {
        result = { day: lockedDay, finalized: false, alreadyClosed: false, outstanding };
        return;
      }
      const orders = await OrderModel.find({ businessDate: date }).session(session).lean();
      const report = buildReport(lockedDay, orders, now);
      const closed = await BusinessDayModel.findOneAndUpdate(
        { _id: date, status: 'closing', report: { $exists: false } },
        { $set: { status: 'closed', closedAt: now, closedBy: ownerId, report }, $unset: { activeLockKey: 1 } },
        { new: true, session, runValidators: true },
      ).lean();
      if (!closed) throw dayError('BUSINESS_DAY_FINALIZE_CONFLICT', 'The report was not finalized. Refresh and retry.');
      result = { day: closed, finalized: true, alreadyClosed: false, outstanding: [] };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return result;
  } finally { await session.endSession(); }
}

async function listOutstandingOrders(date, OrderModel = Order) {
  return OrderModel.find({ businessDate: date, status: { $in: UNRESOLVED_STATUSES } })
    .sort({ createdAt: 1, _id: 1 }).lean();
}

async function listPriorUnresolvedOrders(date, OrderModel = Order) {
  return OrderModel.find({
    status: { $in: UNRESOLVED_STATUSES },
    $or: [{ businessDate: { $lt: date } }, { businessDate: { $exists: false } }, { businessDate: null }],
  }).sort({ createdAt: 1, _id: 1 }).lean();
}

async function currentDaySummary(date, OrderModel = Order) {
  const orders = await OrderModel.find({ businessDate: date }).select('status totalPaise').lean();
  const statusCounts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
  let grossOrderValuePaise = 0;
  for (const order of orders) {
    if (Object.hasOwn(statusCounts, order.status)) statusCounts[order.status] += 1;
    if (!Number.isSafeInteger(order.totalPaise) || order.totalPaise < 0) {
      throw dayError('BUSINESS_DAY_REPORT_INVALID', 'A saved order total is invalid; the business-day summary is unavailable.', 500);
    }
    grossOrderValuePaise += order.totalPaise;
    if (!Number.isSafeInteger(grossOrderValuePaise)) {
      throw dayError('BUSINESS_DAY_REPORT_INVALID', 'The business-day summary exceeds the supported safe range.', 500);
    }
  }
  return { totalOrderCount: orders.length, statusCounts, grossOrderValuePaise };
}

module.exports = {
  UNRESOLVED_STATUSES, buildReport, businessDateFor, currentDaySummary, dayError,
  finalizeBusinessDay, listOutstandingOrders, listPriorUnresolvedOrders, openBusinessDay, requestBusinessDayClosing,
  touchOpenBusinessDay, touchResolvableBusinessDay,
};
