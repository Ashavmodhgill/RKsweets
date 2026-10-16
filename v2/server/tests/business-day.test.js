const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const BusinessDay = require('../models/business-day.model');
const Order = require('../models/order.model');
const { requireOwner } = require('../middlewares/auth');
const { verifyCsrf } = require('../middlewares/csrf');
const { businessDayConfirmSchema } = require('../validators/business-day.validator');
const {
  UNRESOLVED_STATUSES, buildReport, businessDateFor, finalizeBusinessDay,
  openBusinessDay, requestBusinessDayClosing,
} = require('../services/business-day.service');
const adminRoutes = require('../routes/admin.routes');

const DATE = '2026-10-16';
const OWNER = '65a000000000000000000098';

function fakeSession() {
  return { withTransaction: (callback) => callback(), endSession: async () => {} };
}

function fakeModels({ days = [], orders = [] } = {}) {
  const dayRows = new Map(days.map((day) => [day._id, structuredClone(day)]));
  const orderRows = orders.map((order) => structuredClone(order));
  function query(value) {
    return {
      session() { return this; },
      sort() { return this; },
      select() { return this; },
      lean: async () => value,
    };
  }
  function matchesDay(day, filter) {
    if (filter._id && day._id !== filter._id) return false;
    if (typeof filter.status === 'string' && day.status !== filter.status) return false;
    if (Array.isArray(filter.status?.$in) && !filter.status.$in.includes(day.status)) return false;
    if (filter.report?.$exists === false && day.report) return false;
    return true;
  }
  const BusinessDayModel = {
    findOne(filter) { return query([...dayRows.values()].find((day) => matchesDay(day, filter)) || null); },
    findById(id) { return query(dayRows.get(String(id)) || null); },
    async create([day]) {
      if (dayRows.has(day._id) || [...dayRows.values()].some((row) => row.activeLockKey && day.activeLockKey)) {
        const error = new Error('unique conflict'); error.code = 11000; throw error;
      }
      const copy = { ...day, createdAt: day.openedAt, updatedAt: day.openedAt };
      dayRows.set(day._id, copy);
      return [copy];
    },
    findOneAndUpdate(filter, update) {
      const day = [...dayRows.values()].find((row) => matchesDay(row, filter));
      if (!day) return query(null);
      Object.assign(day, update.$set || {});
      for (const [key, amount] of Object.entries(update.$inc || {})) day[key] = (day[key] || 0) + amount;
      for (const key of Object.keys(update.$unset || {})) delete day[key];
      return query(structuredClone(day));
    },
  };
  const OrderModel = {
    findOne(filter) {
      const found = orderRows.find((order) => {
        if (Array.isArray(filter.status?.$in) && !filter.status.$in.includes(order.status)) return false;
        if (filter.$or) return filter.$or.some((branch) => {
          if (branch.businessDate?.$lt) return order.businessDate && order.businessDate < branch.businessDate;
          return !order.businessDate;
        });
        return true;
      }) || null;
      return query(found);
    },
    find(filter) {
      let found = orderRows.filter((order) => {
        if (filter.businessDate && order.businessDate !== filter.businessDate) return false;
        if (Array.isArray(filter.status?.$in) && !filter.status.$in.includes(order.status)) return false;
        return true;
      });
      const q = {
        session() { return this; }, sort() { return this; }, select() { return this; },
        lean: async () => found,
      };
      return q;
    },
  };
  return { dayRows, orderRows, BusinessDayModel, OrderModel };
}

test('business-date key follows the configured timezone through its midnight boundary', () => {
  assert.equal(businessDateFor(new Date('2026-10-16T18:29:59.999Z'), 'Asia/Kolkata'), '2026-10-16');
  assert.equal(businessDateFor(new Date('2026-10-16T18:30:00.000Z'), 'Asia/Kolkata'), '2026-10-17');
});

test('BusinessDay and Order schemas declare stable keys and report indexes', () => {
  assert.equal(BusinessDay.schema.options.collection, 'business_days');
  assert.ok(BusinessDay.schema.indexes().some(([keys, options]) => keys.businessDate === 1 && options.unique));
  assert.ok(BusinessDay.schema.indexes().some(([keys, options]) => keys.activeLockKey === 1 && options.unique && options.sparse));
  assert.ok(Order.schema.indexes().some(([keys]) => keys.businessDate === 1 && keys.status === 1));
  assert.ok(UNRESOLVED_STATUSES.includes('pending_owner_acceptance'));
  assert.ok(UNRESOLVED_STATUSES.includes('ready'));
});

test('day opening is explicit, rejects duplicate/closed dates, and blocks unresolved legacy or prior orders', async () => {
  const deps = fakeModels();
  const first = await openBusinessDay({ ...deps, date: DATE, ownerId: OWNER, now: new Date('2026-10-16T09:00:00Z'), startSession: async () => fakeSession() });
  assert.equal(first.day.status, 'open');
  await assert.rejects(openBusinessDay({ ...deps, date: DATE, ownerId: OWNER, startSession: async () => fakeSession() }), { code: 'BUSINESS_DAY_ALREADY_ACTIVE' });
  deps.dayRows.get(DATE).status = 'closed';
  delete deps.dayRows.get(DATE).activeLockKey;
  await assert.rejects(openBusinessDay({ ...deps, date: DATE, ownerId: OWNER, startSession: async () => fakeSession() }), { code: 'BUSINESS_DAY_CLOSED' });

  const unresolved = fakeModels({ orders: [{ status: 'pending_owner_acceptance' }] });
  await assert.rejects(openBusinessDay({ ...unresolved, date: DATE, ownerId: OWNER, startSession: async () => fakeSession() }), { code: 'BUSINESS_DAY_PRIOR_ORDERS' });
});

test('simultaneous opens converge to one active day and close requests transition once', async () => {
  const opening = fakeModels();
  const results = await Promise.allSettled([
    openBusinessDay({ ...opening, date: DATE, ownerId: OWNER, startSession: async () => fakeSession() }),
    openBusinessDay({ ...opening, date: DATE, ownerId: OWNER, startSession: async () => fakeSession() }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  const closing = fakeModels({ days: [{ _id: DATE, businessDate: DATE, status: 'open', activeLockKey: 'active', openedAt: new Date(0), openedBy: OWNER }] });
  const closeResults = await Promise.all([
    requestBusinessDayClosing({ date: DATE, ownerId: OWNER, BusinessDayModel: closing.BusinessDayModel }),
    requestBusinessDayClosing({ date: DATE, ownerId: OWNER, BusinessDayModel: closing.BusinessDayModel }),
  ]);
  assert.deepEqual(closeResults.map((result) => result.transitioned).sort(), [false, true]);
});

test('closing pauses new work, blocks finalization while unresolved, then stores an immutable integer-paise report', async () => {
  const deps = fakeModels({
    days: [{ _id: DATE, businessDate: DATE, status: 'open', activeLockKey: 'active', openedAt: new Date('2026-10-16T09:00:00Z'), openedBy: OWNER, workflowVersion: 0 }],
    orders: [
      { _id: 'one', businessDate: DATE, status: 'rejected', totalPaise: 10001, fulfillmentMethod: 'pickup' },
      { _id: 'two', businessDate: DATE, status: 'ready', totalPaise: 2300, fulfillmentMethod: 'dine_in', officialToken: 2, tokenDate: DATE },
    ],
  });
  const closing = await requestBusinessDayClosing({ date: DATE, ownerId: OWNER, BusinessDayModel: deps.BusinessDayModel });
  assert.equal(closing.day.status, 'closing');
  const retry = await requestBusinessDayClosing({ date: DATE, ownerId: OWNER, BusinessDayModel: deps.BusinessDayModel });
  assert.equal(retry.transitioned, false);
  const blocked = await finalizeBusinessDay({ ...deps, date: DATE, ownerId: OWNER, startSession: async () => fakeSession() });
  assert.equal(blocked.finalized, false);
  assert.equal(blocked.outstanding.length, 1);

  deps.orderRows[1].status = 'completed';
  const closedAt = new Date('2026-10-16T20:00:00Z');
  const finalized = await finalizeBusinessDay({ ...deps, date: DATE, ownerId: OWNER, now: closedAt, startSession: async () => fakeSession() });
  assert.equal(finalized.finalized, true);
  assert.equal(finalized.day.status, 'closed');
  assert.equal(finalized.day.report.totalOrderCount, 2);
  assert.equal(finalized.day.report.grossOrderValuePaise, 12301);
  assert.equal(finalized.day.report.fulfilmentTotals.pickup.grossOrderValuePaise, 10001);
  assert.equal(finalized.day.report.completedOrderCount, 1);
  assert.equal(finalized.day.report.paidSalesStatus, 'not_recorded');
  assert.equal(finalized.day.report.paidSalesPaise, null);
  assert.equal(finalized.day.report.paidSalesExcludedOrderCount, 2);
  assert.deepEqual(finalized.day.report.officialTokens, [{ tokenDate: DATE, token: 2 }]);

  deps.orderRows[0].totalPaise = 999999;
  const retryFinalize = await finalizeBusinessDay({ ...deps, date: DATE, ownerId: OWNER, startSession: async () => fakeSession() });
  assert.equal(retryFinalize.alreadyClosed, true);
  assert.equal(retryFinalize.day.report.grossOrderValuePaise, 12301);
});

test('report uses persisted paise snapshots and never describes gross order value as collected sales', () => {
  const report = buildReport({ businessDate: DATE, openedAt: new Date(0) }, [
    { status: 'completed', totalPaise: 9999, fulfillmentMethod: 'pickup', officialToken: 1, tokenDate: '2026-10-17' },
  ], new Date(1));
  assert.equal(report.grossOrderValuePaise, 9999);
  assert.deepEqual(report.officialTokens, [{ tokenDate: '2026-10-17', token: 1 }]);
  assert.equal(report.paidSalesStatus, 'not_recorded');
});

test('business-day mutations are owner-protected; confirm fields are validated and CSRF stays global', () => {
  for (const pathValue of ['/business-days/open', '/business-days/close', '/business-days/finalize']) {
    const route = adminRoutes.stack.find((layer) => layer.route?.path === pathValue && layer.route.methods.post)?.route;
    assert.ok(route, `missing route ${pathValue}`);
    assert.equal(route.stack[0].handle, requireOwner);
  }
  const appSource = fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8');
  assert.match(appSource, /app\.use\(verifyCsrf\)/);
  assert.equal(businessDayConfirmSchema.safeParse({ confirm: 'yes' }).success, true);
  assert.equal(businessDayConfirmSchema.safeParse({ confirm: 'no' }).success, false);
  let csrfResult;
  verifyCsrf({ method: 'POST', get: () => null, body: { _csrf: 'session-token' }, session: { csrfToken: 'session-token' } }, {}, (error) => { csrfResult = error; });
  assert.equal(csrfResult, undefined);
});
