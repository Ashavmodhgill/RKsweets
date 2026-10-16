const BusinessDay = require('../models/business-day.model');
const Order = require('../models/order.model');
const { ORDER_STATUS } = require('../constants/order-status');
const {
  businessDateFor, currentDaySummary, finalizeBusinessDay, listOutstandingOrders, listPriorUnresolvedOrders,
  openBusinessDay, requestBusinessDayClosing,
} = require('../services/business-day.service');

const STATUS_LABELS = Object.freeze({
  [ORDER_STATUS.PENDING]: 'Awaiting acceptance', [ORDER_STATUS.ACCEPTED]: 'Accepted',
  [ORDER_STATUS.REJECTED]: 'Rejected', [ORDER_STATUS.PREPARING]: 'Preparing',
  [ORDER_STATUS.READY]: 'Ready', [ORDER_STATUS.COMPLETED]: 'Completed',
  [ORDER_STATUS.CANCELLED]: 'Cancelled',
});

function currentBusinessDate(req) {
  return businessDateFor(new Date(), req.app.locals.businessTimezone);
}

async function index(req, res, next) {
  try {
    const active = await BusinessDay.findOne({ status: { $in: ['open', 'closing'] } }).select('+activeLockKey').lean();
    const date = active?.businessDate || currentBusinessDate(req);
    const day = active || await BusinessDay.findById(date).lean();
    const summary = day?.report || await currentDaySummary(date, Order);
    const outstanding = day?.status === 'closing' ? await listOutstandingOrders(date, Order) : [];
    const priorUnresolved = !day ? await listPriorUnresolvedOrders(date, Order) : [];
    return res.render('admin/views/pages/business-day', {
      pageTitle: 'Business Day', account: req.authAccount, day, businessDate: date, summary,
      businessTimezone: req.app.locals.businessTimezone,
      outstanding, priorUnresolved, statusLabels: STATUS_LABELS, notice: req.query.notice || '',
      paidSalesMessage: 'Paid sales are not recorded. Order completion does not prove payment was received.',
    });
  } catch (error) { return next(error); }
}

async function open(req, res, next) {
  try {
    await openBusinessDay({ date: currentBusinessDate(req), ownerId: req.authAccount._id });
    return res.redirect(303, '/business-days?notice=opened');
  } catch (error) {
    if (['BUSINESS_DAY_ALREADY_ACTIVE', 'BUSINESS_DAY_CLOSED', 'BUSINESS_DAY_PRIOR_ORDERS'].includes(error.code)) {
      return res.redirect(303, `/business-days?notice=${encodeURIComponent(error.code)}`);
    }
    return next(error);
  }
}

async function requestClose(req, res, next) {
  try {
    const day = await BusinessDay.findOne({ status: 'open' }).select('_id').lean();
    if (!day) return res.redirect(303, '/business-days?notice=BUSINESS_DAY_NOT_OPEN');
    await requestBusinessDayClosing({ date: day._id, ownerId: req.authAccount._id });
    return res.redirect(303, '/business-days?notice=closing');
  } catch (error) {
    if (['BUSINESS_DAY_CLOSED', 'BUSINESS_DAY_NOT_OPEN'].includes(error.code)) {
      return res.redirect(303, `/business-days?notice=${encodeURIComponent(error.code)}`);
    }
    return next(error);
  }
}

async function finalize(req, res, next) {
  try {
    const day = await BusinessDay.findOne({ status: 'closing' }).select('_id').lean();
    if (!day) return res.redirect(303, '/business-days?notice=BUSINESS_DAY_NOT_CLOSING');
    const result = await finalizeBusinessDay({ date: day._id, ownerId: req.authAccount._id });
    return res.redirect(303, result.finalized || result.alreadyClosed
      ? `/business-days/reports/${day._id}`
      : '/business-days?notice=outstanding');
  } catch (error) {
    if (['BUSINESS_DAY_NOT_CLOSING', 'BUSINESS_DAY_FINALIZE_CONFLICT'].includes(error.code)) {
      return res.redirect(303, `/business-days?notice=${encodeURIComponent(error.code)}`);
    }
    return next(error);
  }
}

async function reports(req, res, next) {
  try {
    const days = await BusinessDay.find({ status: 'closed', report: { $exists: true } })
      .sort({ businessDate: -1 }).limit(100).lean();
    return res.render('admin/views/pages/business-day-reports', {
      pageTitle: 'Business Day Reports', account: req.authAccount, days,
    });
  } catch (error) { return next(error); }
}

async function report(req, res, next) {
  try {
    const day = await BusinessDay.findOne({ _id: req.validated.params.businessDate, status: 'closed', report: { $exists: true } }).lean();
    if (!day) {
      const error = new Error('Business day report not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }
    return res.render('admin/views/pages/business-day-report', {
      pageTitle: `Business Day Report · ${day.businessDate}`, account: req.authAccount, day,
      statusLabels: STATUS_LABELS,
    });
  } catch (error) { return next(error); }
}

module.exports = { finalize, index, open, report, reports, requestClose };
