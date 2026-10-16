const test = require('node:test');
const assert = require('node:assert/strict');
const {
  NOTIFICATION_EVENT, acceptedOrderEvents, customerOrderEvent, ownerOrderPlacedEvent,
} = require('../constants/notification-events');
const { createNotificationService, notificationIdFor } = require('../services/notification.service');
const { notificationIdParamsSchema, notificationLimitSchema } = require('../validators/notification.validator');

const ORDER_ID = '65a000000000000000000099';
const CUSTOMER_A = '65a000000000000000000010';
const CUSTOMER_B = '65a000000000000000000011';
const OWNER_ID = '65a000000000000000000098';

function fakeNotificationModels({ failWrites = false } = {}) {
  const records = new Map();
  const orders = new Map();
  const clone = (value) => value ? structuredClone(value) : null;
  const query = (fn) => ({
    sort() { return this; }, limit() { return this; }, select() { return this; },
    lean: async () => fn(),
  });
  const NotificationModel = {
    records,
    failWrites,
    findOneAndUpdate(filter, update) {
      return query(async () => {
        if (update.$setOnInsert) {
          if (this.failWrites) throw new Error('simulated write unavailable');
          if (!records.has(filter._id)) records.set(filter._id, clone(update.$setOnInsert));
          return clone(records.get(filter._id));
        }
        const record = records.get(filter._id);
        if (!record || record.recipientType !== filter.recipientType
          || String(record.recipientId) !== String(filter.recipientId)
          || record.readAt !== null) return null;
        Object.assign(record, update.$set);
        return clone(record);
      });
    },
    findById(id) { return query(() => clone(records.get(id))); },
    find(filter) {
      return query(() => [...records.values()]
        .filter((item) => item.recipientType === filter.recipientType && String(item.recipientId) === String(filter.recipientId))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50).map(clone));
    },
    countDocuments(filter) {
      return [...records.values()].filter((item) => item.recipientType === filter.recipientType
        && String(item.recipientId) === String(filter.recipientId) && item.readAt === null).length;
    },
    async updateMany(filter, update) {
      let modifiedCount = 0;
      for (const record of records.values()) {
        if (record.recipientType === filter.recipientType && String(record.recipientId) === String(filter.recipientId)
          && record.readAt === null) { Object.assign(record, update.$set); modifiedCount += 1; }
      }
      return { modifiedCount };
    },
  };
  const OrderModel = {
    records: orders,
    findById(id) { return query(() => clone(orders.get(String(id)))); },
    find(filter) {
      return query(() => [...orders.values()].filter((order) =>
        (order.notificationOutbox || []).some((event) => event.deliveredAt === null
          && event.recipientType === filter.notificationOutbox.$elemMatch.recipientType
          && (filter.notificationOutbox.$elemMatch.recipientId === undefined
            || String(event.recipientId) === String(filter.notificationOutbox.$elemMatch.recipientId))))
        .map(clone));
    },
    async updateOne(filter, update) {
      const order = orders.get(String(filter._id));
      const event = order?.notificationOutbox.find((item) => item.eventKey === filter.notificationOutbox.$elemMatch.eventKey
        && item.deliveredAt === null);
      if (!event) return { matchedCount: 0 };
      event.deliveredAt = update.$set['notificationOutbox.$.deliveredAt'];
      return { matchedCount: 1 };
    },
  };
  const OwnerModel = { findOne: () => query(() => ({ _id: OWNER_ID })) };
  return { NotificationModel, OrderModel, OwnerModel };
}

function eventOrder(events) {
  return {
    _id: ORDER_ID,
    createdAt: new Date('2026-10-16T10:00:00Z'),
    notificationOutbox: events,
  };
}

test('new order notification targets only owner; accepted event bundle targets the ordering customer with token and estimate', async () => {
  const models = fakeNotificationModels();
  const accepted = {
    _id: ORDER_ID, customerId: CUSTOMER_A, acceptedAt: new Date('2026-10-16T10:05:00Z'),
    officialToken: 7, tokenDate: '2026-10-16', confirmedPrepMinutes: 24,
  };
  const order = eventOrder([ownerOrderPlacedEvent(accepted), ...acceptedOrderEvents(accepted)]);
  models.OrderModel.records.set(ORDER_ID, order);
  const service = createNotificationService(models);
  await service.dispatchOrderOutbox(ORDER_ID);
  const notifications = await service.list('customer', CUSTOMER_A);
  assert.equal(await service.unreadCount('owner', OWNER_ID), 1);
  assert.equal(await service.unreadCount('customer', CUSTOMER_A), 3);
  assert.deepEqual(new Set(notifications.map((item) => item.eventType)), new Set([
    NOTIFICATION_EVENT.ORDER_ACCEPTED, NOTIFICATION_EVENT.TOKEN_ASSIGNED, NOTIFICATION_EVENT.PREP_ESTIMATE_CONFIRMED,
  ]));
  assert.ok(notifications.every((item) => String(item.recipientId) === CUSTOMER_A));
  assert.ok(notifications.some((item) => item.orderToken === 7 && item.message.includes('24 minutes')));
  await service.dispatchOrderOutbox(ORDER_ID);
  assert.equal(models.NotificationModel.records.size, 4);
});

test('recipient scopes isolate customers and owner notifications; read states and counts are scoped', async () => {
  const models = fakeNotificationModels();
  const firstOrder = eventOrder([customerOrderEvent({ _id: ORDER_ID, customerId: CUSTOMER_A }, NOTIFICATION_EVENT.ORDER_REJECTED, 'Rejected', 'Actual reason: kitchen closed')]);
  const secondOrder = { ...eventOrder([customerOrderEvent({ _id: '65a000000000000000000088', customerId: CUSTOMER_B }, NOTIFICATION_EVENT.ORDER_COMPLETED, 'Complete', 'Done')]), _id: '65a000000000000000000088' };
  const thirdOrder = { ...eventOrder([customerOrderEvent({ _id: '65a000000000000000000077', customerId: CUSTOMER_A }, NOTIFICATION_EVENT.ORDER_COMPLETED, 'Complete', 'Done')]), _id: '65a000000000000000000077' };
  models.OrderModel.records.set(ORDER_ID, firstOrder);
  models.OrderModel.records.set(secondOrder._id, secondOrder);
  models.OrderModel.records.set(thirdOrder._id, thirdOrder);
  const service = createNotificationService(models);
  await service.dispatchPendingFor('customer', CUSTOMER_A);
  assert.equal(await service.unreadCount('customer', CUSTOMER_A), 2);
  // Loading B's unread count delivers only B's own pending outbox entry.
  assert.equal(await service.unreadCount('customer', CUSTOMER_B), 1);
  const mine = await service.list('customer', CUSTOMER_A);
  assert.equal(mine[0].message, 'Actual reason: kitchen closed');
  assert.equal((await service.list('customer', CUSTOMER_B))[0].message, 'Done');
  const denied = await service.markOneRead('customer', CUSTOMER_B, mine[0]._id);
  assert.equal(denied, null);
  assert.equal(await service.markAllRead('owner', OWNER_ID), 0);
  assert.equal(await service.markOneRead('customer', CUSTOMER_A, mine[0]._id) !== null, true);
  assert.equal(await service.unreadCount('customer', CUSTOMER_A), 1);
  assert.equal(await service.markAllRead('customer', CUSTOMER_A), 1);
  assert.equal(await service.unreadCount('customer', CUSTOMER_A), 0);
});

test('notification delivery failures leave durable outbox events retryable and deduplicated', async () => {
  const models = fakeNotificationModels({ failWrites: true });
  const event = ownerOrderPlacedEvent({ _id: ORDER_ID });
  const order = eventOrder([event]);
  models.OrderModel.records.set(ORDER_ID, order);
  const service = createNotificationService(models);
  const originalError = console.error;
  console.error = () => {};
  try { await service.dispatchOrderOutbox(ORDER_ID); } finally { console.error = originalError; }
  assert.equal(order.notificationOutbox[0].deliveredAt, null);
  assert.equal(models.NotificationModel.records.size, 0);
  models.NotificationModel.failWrites = false;
  await service.dispatchOrderOutbox(ORDER_ID);
  await service.dispatchOrderOutbox(ORDER_ID);
  assert.equal(models.NotificationModel.records.size, 1);
  assert.equal(order.notificationOutbox[0].deliveredAt instanceof Date, true);
  assert.equal(notificationIdFor(event.eventKey), notificationIdFor(event.eventKey));
});

test('notification IDs and bounded query validation reject malformed input', () => {
  assert.equal(notificationIdParamsSchema.safeParse({ notificationId: notificationIdFor('event') }).success, true);
  assert.equal(notificationIdParamsSchema.safeParse({ notificationId: 'bad-id' }).success, false);
  assert.equal(notificationIdFor('event').length, 64);
  assert.equal(notificationLimitSchema.safeParse({ limit: '50' }).success, true);
  assert.equal(notificationLimitSchema.safeParse({ limit: '51' }).success, false);
});
