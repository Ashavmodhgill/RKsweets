const test = require('node:test');
const assert = require('node:assert/strict');
const {
  acceptOrder, businessDateFor, completeOrder, rejectOrder, suggestedPreparationMinutes,
} = require('../services/owner-order.service');
const { acceptOrderSchema, rejectOrderSchema } = require('../validators/owner-order.validator');
const Owner = require('../models/owner.model');
const { requireOwner } = require('../middlewares/auth');
const Order = require('../models/order.model');
const OrderTokenCounter = require('../models/order-token-counter.model');

const ORDER_ID = '65a000000000000000000099';
const OWNER_ID = '65a000000000000000000098';

function fakeModels(status = 'pending_owner_acceptance') {
  const order = {
    _id: ORDER_ID, customerId: '65a000000000000000000010', businessDate: '2026-10-17', status, items: [{ prepMinutes: 8 }, { prepMinutes: 22 }], notificationOutbox: [],
  };
  const day = { _id: '2026-10-17', businessDate: '2026-10-17', status: 'open', workflowVersion: 0 };
  let transactionTail = Promise.resolve();
  const counter = new Map();
  const query = (value) => ({ session() { return this; }, lean: async () => value ? structuredClone(value) : null });
  const OrderModel = {
    findById: () => query(order.status === 'missing' ? null : order),
    findOneAndUpdate(filter, update) {
      const acceptedStatus = filter.status;
      const allowed = Array.isArray(acceptedStatus?.$in)
        ? acceptedStatus.$in.includes(order.status)
        : order.status === acceptedStatus;
      if (!allowed) return query(null);
      Object.assign(order, update.$set || {});
      if (update.$push?.notificationOutbox) {
        const pushed = update.$push.notificationOutbox.$each || [update.$push.notificationOutbox];
        order.notificationOutbox = [...(order.notificationOutbox || []), ...pushed];
      }
      return query(order);
    },
  };
  const CounterModel = {
    async findOneAndUpdate(filter, update) {
      const value = (counter.get(filter._id) || 0) + update.$inc.value;
      counter.set(filter._id, value);
      return { value };
    },
  };
  const BusinessDayModel = {
    findOneAndUpdate(filter, update) {
      const allowed = filter.status === day.status
        || (Array.isArray(filter.status?.$in) && filter.status.$in.includes(day.status));
      return { lean: async () => {
        if (filter._id !== day._id || !allowed) return null;
        day.workflowVersion += update.$inc.workflowVersion;
        return structuredClone(day);
      } };
    },
  };
  const startSession = async () => ({
    withTransaction: async (callback) => {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await callback(); } finally { release(); }
    },
    endSession: async () => {},
  });
  return { order, day, counter, OrderModel, BusinessDayModel, CounterModel, startSession };
}

test('daily token date follows BUSINESS_TIMEZONE and prep suggestion uses max item snapshot', () => {
  assert.equal(businessDateFor(new Date('2026-10-16T18:29:59.999Z'), 'Asia/Kolkata'), '2026-10-16');
  assert.equal(businessDateFor(new Date('2026-10-16T18:30:00.000Z'), 'Asia/Kolkata'), '2026-10-17');
  assert.equal(businessDateFor(new Date('2026-10-16T18:45:00.000Z'), 'Asia/Kolkata'), '2026-10-17');
  assert.equal(suggestedPreparationMinutes({ items: [{ prepMinutes: 8 }, { prepMinutes: 22 }] }), 22);
});

test('schema declares daily token uniqueness and the counter has one key per business date', () => {
  const tokenIndex = Order.schema.indexes().find(([keys, options]) =>
    keys.tokenDate === 1 && keys.officialToken === 1 && options.name === 'unique_daily_official_order_token');
  assert.ok(tokenIndex);
  assert.equal(tokenIndex[1].unique, true);
  assert.deepEqual(tokenIndex[1].partialFilterExpression, { officialToken: { $exists: true } });
  assert.ok(OrderTokenCounter.schema.path('_id'));
  assert.equal(OrderTokenCounter.schema.options.collection, 'order_token_counters');
});

test('acceptance allocates one token, snapshots estimate and adjustment reason, and repeated accept does not allocate another', async () => {
  const deps = fakeModels();
  const input = {
    ...deps, orderId: ORDER_ID, ownerId: OWNER_ID, timeZone: 'Asia/Kolkata',
    now: new Date('2026-10-16T18:45:00.000Z'), confirmedPrepMinutes: 30, adjustmentReason: 'Large batch',
  };
  const first = await acceptOrder(input);
  const second = await acceptOrder(input);
  assert.equal(first.transitioned, true);
  assert.equal(first.order.officialToken, 1);
  assert.equal(first.order.tokenDate, '2026-10-17');
  assert.equal(first.order.suggestedPrepMinutes, 22);
  assert.equal(first.order.confirmedPrepMinutes, 30);
  assert.equal(first.order.prepTimeConfirmedAt.toISOString(), input.now.toISOString());
  assert.equal(first.order.prepTimeAdjustmentReason, 'Large batch');
  assert.equal(first.order.notificationOutbox.length, 3);
  assert.ok(first.order.notificationOutbox.every((event) => event.recipientType === 'customer'));
  assert.equal(second.transitioned, false);
  assert.equal(second.order.officialToken, 1);
  assert.equal(deps.counter.get('2026-10-17'), 1);
});

test('concurrent duplicate accept requests converge on one acceptance and one token', async () => {
  const deps = fakeModels();
  const input = {
    ...deps, orderId: ORDER_ID, ownerId: OWNER_ID, timeZone: 'Asia/Kolkata',
    now: new Date('2026-10-16T18:45:00.000Z'), confirmedPrepMinutes: 22,
  };
  const [first, second] = await Promise.all([acceptOrder(input), acceptOrder(input)]);
  assert.deepEqual([first.transitioned, second.transitioned].sort(), [false, true]);
  assert.equal(first.order.officialToken, 1);
  assert.equal(second.order.officialToken, 1);
  assert.equal(deps.counter.get('2026-10-17'), 1);
});

test('owner acceptance is blocked during closing before token allocation', async () => {
  const deps = fakeModels();
  deps.day.status = 'closing';
  await assert.rejects(acceptOrder({
    ...deps, orderId: ORDER_ID, ownerId: OWNER_ID, timeZone: 'Asia/Kolkata', confirmedPrepMinutes: 22,
  }), { code: 'BUSINESS_DAY_NOT_OPEN' });
  assert.equal(deps.order.status, 'pending_owner_acceptance');
  assert.equal(deps.counter.size, 0);
});

test('a concurrent rejection wins against a stale acceptance and token allocation is rolled back', async () => {
  const deps = fakeModels();
  let orderRead;
  let resumeAcceptance;
  let hasPausedAcceptance = false;
  const readReached = new Promise((resolve) => { orderRead = resolve; });
  const acceptanceGate = new Promise((resolve) => { resumeAcceptance = resolve; });
  const findById = deps.OrderModel.findById.bind(deps.OrderModel);
  deps.OrderModel.findById = (id) => {
    const query = findById(id);
    let usesTransaction = false;
    return {
      session() { usesTransaction = true; return this; },
      async lean() {
        const snapshot = await query.lean();
        if (usesTransaction && !hasPausedAcceptance) {
          hasPausedAcceptance = true;
          orderRead();
          await acceptanceGate;
        }
        return snapshot;
      },
    };
  };
  deps.startSession = async () => ({
    withTransaction: async (callback) => {
      const priorCounter = new Map(deps.counter);
      try { return await callback(); } catch (error) {
        deps.counter.clear();
        for (const [date, value] of priorCounter) deps.counter.set(date, value);
        throw error;
      }
    },
    endSession: async () => {},
  });
  const accepting = acceptOrder({
    ...deps, orderId: ORDER_ID, ownerId: OWNER_ID, timeZone: 'Asia/Kolkata', confirmedPrepMinutes: 22,
  });
  await readReached;
  const rejected = await rejectOrder({ ...deps, orderId: ORDER_ID, ownerId: OWNER_ID, reason: 'Kitchen closed' });
  resumeAcceptance();
  await assert.rejects(accepting, { code: 'ORDER_TRANSITION_CONFLICT' });
  assert.equal(rejected.transitioned, true);
  assert.equal(deps.order.status, 'rejected');
  assert.equal(deps.counter.size, 0);
});

test('changed prep estimate requires an explanation and form validation bounds it', async () => {
  const deps = fakeModels();
  await assert.rejects(acceptOrder({
    ...deps, orderId: ORDER_ID, ownerId: OWNER_ID, timeZone: 'UTC', confirmedPrepMinutes: 25,
  }), { code: 'PREP_ADJUSTMENT_REASON_REQUIRED' });
  assert.equal(deps.counter.size, 0);
  assert.equal(acceptOrderSchema.safeParse({ confirmedPrepMinutes: '1441' }).success, false);
  assert.equal(acceptOrderSchema.safeParse({ confirmedPrepMinutes: '22' }).success, true);
});

test('rejection requires a reason and only transitions pending orders', async () => {
  const deps = fakeModels();
  await assert.rejects(rejectOrder({ ...deps, orderId: ORDER_ID, ownerId: OWNER_ID, reason: '  ' }), { code: 'REJECTION_REASON_REQUIRED' });
  assert.equal(rejectOrderSchema.safeParse({ reason: '  ' }).success, false);
  const rejected = await rejectOrder({ ...deps, orderId: ORDER_ID, ownerId: OWNER_ID, reason: 'Kitchen closed' });
  assert.equal(rejected.transitioned, true);
  assert.equal(rejected.order.status, 'rejected');
  assert.equal(rejected.order.rejectionReason, 'Kitchen closed');
  assert.equal(rejected.order.notificationOutbox.at(-1).eventType, 'order_rejected');
  assert.match(rejected.order.notificationOutbox.at(-1).message, /Kitchen closed/);
  const duplicate = await rejectOrder({ ...deps, orderId: ORDER_ID, ownerId: OWNER_ID, reason: 'Again' });
  assert.equal(duplicate.transitioned, false);
});

test('pending rejection and active-order completion remain available during closing', async () => {
  const pending = fakeModels();
  pending.day.status = 'closing';
  const rejected = await rejectOrder({ ...pending, orderId: ORDER_ID, ownerId: OWNER_ID, reason: 'Kitchen closed' });
  assert.equal(rejected.transitioned, true);

  const accepted = fakeModels('accepted');
  accepted.day.status = 'closing';
  const completed = await completeOrder({ ...accepted, orderId: ORDER_ID, ownerId: OWNER_ID });
  assert.equal(completed.transitioned, true);
  assert.equal(completed.order.status, 'completed');
});

test('completion is limited to accepted workflow states', async () => {
  const pending = fakeModels();
  const denied = await completeOrder({ ...pending, orderId: ORDER_ID, ownerId: OWNER_ID });
  assert.equal(denied.transitioned, false);
  const accepted = fakeModels('accepted');
  const done = await completeOrder({ ...accepted, orderId: ORDER_ID, ownerId: OWNER_ID });
  assert.equal(done.transitioned, true);
  assert.equal(done.order.status, 'completed');
  assert.ok(done.order.completedAt instanceof Date);
  assert.equal(done.order.notificationOutbox.at(-1).eventType, 'order_completed');
});

test('owner authorization resolves an Owner record and redirects sessions without one', async () => {
  const originalFindById = Owner.findById;
  Owner.findById = (id) => ({
    select() { return this; },
    lean: async () => String(id) === OWNER_ID ? { _id: OWNER_ID, name: 'Owner', mobile: '+919876543210' } : null,
  });
  const invoke = (req) => new Promise((resolve, reject) => {
    const res = {
      clearCookie() {},
      redirect(path) { resolve({ redirected: path }); },
    };
    requireOwner(req, res, (error) => error ? reject(error) : resolve({ account: req.authAccount }));
  });
  try {
    const allowed = await invoke({ session: { auth: { accountId: OWNER_ID }, destroy: (cb) => cb(null) } });
    assert.equal(String(allowed.account._id), OWNER_ID);
    const denied = await invoke({ session: { auth: { accountId: '65a000000000000000000097' }, destroy: (cb) => cb(null) } });
    assert.deepEqual(denied, { redirected: '/login' });
  } finally {
    Owner.findById = originalFindById;
  }
});
