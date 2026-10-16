const Order = require('../models/order.model');
const BusinessDay = require('../models/business-day.model');
const { ORDER_STATUSES } = require('../constants/order-status');
const { acceptOrder, completeOrder, rejectOrder, suggestedPreparationMinutes } = require('../services/owner-order.service');
const { dispatchOrderOutbox } = require('../services/notification.service');

const PAGE_SIZE = 20;
const LABELS = Object.freeze({
  pending_owner_acceptance: 'Awaiting acceptance', accepted: 'Accepted', rejected: 'Rejected',
  preparing: 'Preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled',
});

async function list(req, res, next) {
  try {
    const { status, page } = req.validated.query;
    const filter = status ? { status } : {};
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      Order.countDocuments(filter),
    ]);
    return res.render('admin/views/pages/orders', {
      pageTitle: 'Orders', account: req.authAccount, orders, status, page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, statuses: ORDER_STATUSES, labels: LABELS,
    });
  } catch (error) { return next(error); }
}

async function detail(req, res, next) {
  try {
    const order = await Order.findById(req.validated.params.orderId).lean();
    if (!order) return res.status(404).render('admin/views/pages/order-detail', {
      pageTitle: 'Order not found', account: req.authAccount, order: null, labels: LABELS,
      suggestedPrepMinutes: 0, businessDayStatus: null, notice: 'The requested order could not be found.',
    });
    const businessDay = order.businessDate ? await BusinessDay.findById(order.businessDate).select('status').lean() : null;
    return res.render('admin/views/pages/order-detail', {
      pageTitle: `Order #${order.officialToken || '—'}`, account: req.authAccount, order, labels: LABELS,
      suggestedPrepMinutes: order.suggestedPrepMinutes ?? suggestedPreparationMinutes(order),
      businessDayStatus: businessDay?.status || null,
      notice: req.query.notice || '',
    });
  } catch (error) { return next(error); }
}

function actionRedirect(res, orderId, notice) { return res.redirect(303, `/orders/${orderId}?notice=${encodeURIComponent(notice)}`); }

async function accept(req, res, next) {
  try {
    const result = await acceptOrder({
      orderId: req.validated.params.orderId, ownerId: req.authAccount._id,
      confirmedPrepMinutes: req.validated.body.confirmedPrepMinutes,
      adjustmentReason: req.validated.body.adjustmentReason,
      timeZone: req.app.locals.businessTimezone,
    });
    await dispatchOrderOutbox(req.validated.params.orderId);
    if (!result.order) return actionRedirect(res, req.validated.params.orderId, 'not-found');
    return actionRedirect(res, req.validated.params.orderId, result.transitioned ? 'accepted' : 'already-processed');
  } catch (error) {
    if (error.code === 'PREP_ADJUSTMENT_REASON_REQUIRED') return actionRedirect(res, req.validated.params.orderId, 'reason-required');
    if (error.code === 'ORDER_TRANSITION_CONFLICT') return actionRedirect(res, req.validated.params.orderId, 'conflict');
    if (error.code === 'BUSINESS_DAY_NOT_OPEN') return actionRedirect(res, req.validated.params.orderId, 'business-day-closed');
    return next(error);
  }
}

async function reject(req, res, next) {
  try {
    const result = await rejectOrder({ orderId: req.validated.params.orderId, ownerId: req.authAccount._id, reason: req.validated.body.reason });
    await dispatchOrderOutbox(req.validated.params.orderId);
    if (!result.order) return actionRedirect(res, req.validated.params.orderId, 'not-found');
    return actionRedirect(res, req.validated.params.orderId, result.transitioned ? 'rejected' : 'already-processed');
  } catch (error) {
    if (error.code === 'BUSINESS_DAY_FINALIZED' || error.code === 'ORDER_TRANSITION_CONFLICT') return actionRedirect(res, req.validated.params.orderId, 'conflict');
    return next(error);
  }
}

async function complete(req, res, next) {
  try {
    const result = await completeOrder({ orderId: req.validated.params.orderId, ownerId: req.authAccount._id });
    await dispatchOrderOutbox(req.validated.params.orderId);
    if (!result.order) return actionRedirect(res, req.validated.params.orderId, 'not-found');
    return actionRedirect(res, req.validated.params.orderId, result.transitioned ? 'completed' : 'invalid-transition');
  } catch (error) {
    if (error.code === 'BUSINESS_DAY_FINALIZED' || error.code === 'ORDER_TRANSITION_CONFLICT') return actionRedirect(res, req.validated.params.orderId, 'conflict');
    return next(error);
  }
}

module.exports = { accept, complete, detail, list, reject };
