const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clearCartAfterPersistedOrder,
  findCustomerOrder,
  makeOrderSnapshot,
  orderIdFor,
  placeCustomerOrder,
} = require('../services/customer-order.service');

const CUSTOMER_ID = '65a000000000000000000010';
const OTHER_CUSTOMER_ID = '65a000000000000000000011';
const PRODUCT_ID = '65a000000000000000000001';
const TABLE_ID = '65a000000000000000000020';
const KEY = 'f41e5539-5e75-4b4f-bdc3-f9e19863f671';
const BUSINESS_DATE = '2026-10-16';
const customer = { name: 'Riya Shah', mobile: '+919876543210' };
const product = {
  _id: PRODUCT_ID,
  name: 'Kaju Katli',
  isAvailable: true,
  unitType: 'piece',
  quantityPerPiece: 1,
  pricePaise: 12500,
  prepMinutes: 18,
};
const lines = [{ productId: PRODUCT_ID, quantity: 2 }];

function fakeOrderModel({ failCreate = false } = {}) {
  const records = new Map();
  return {
    records,
    findById(id) {
      return { lean: async () => records.get(String(id)) || null };
    },
    findOne(filter) {
      return { lean: async () => {
        const record = records.get(String(filter._id));
        return record && String(record.customerId) === String(filter.customerId) ? record : null;
      } };
    },
    async create([record]) {
      if (failCreate) throw new Error('database write failed');
      const key = String(record._id);
      if (records.has(key)) {
        const error = new Error('duplicate order');
        error.code = 11000;
        throw error;
      }
      const saved = { ...record, _id: record._id, createdAt: new Date('2026-10-16T00:00:00.000Z') };
      records.set(key, saved);
      return [saved];
    },
  };
}

function fakeBusinessDayModel(status = 'open') {
  const day = { _id: BUSINESS_DATE, businessDate: BUSINESS_DATE, status, workflowVersion: 0 };
  return {
    findOneAndUpdate(filter, update) {
      return { lean: async () => {
        if (filter._id !== BUSINESS_DATE || filter.status !== 'open' || day.status !== 'open') return null;
        day.workflowVersion += update.$inc.workflowVersion;
        return day;
      } };
    },
  };
}
const BusinessDayModel = fakeBusinessDayModel();
const startSession = async () => ({
  withTransaction: async (callback) => callback(),
  endSession: async () => {},
});
const dayDeps = { BusinessDayModel, businessDate: BUSINESS_DATE, startSession };

test('order snapshots recalculate current price and retain item, unit, and prep information in paise', () => {
  const snapshot = makeOrderSnapshot({
    customerId: CUSTOMER_ID,
    customer,
    cartLines: lines,
    products: [{ ...product, pricePaise: 12999, prepMinutes: 22 }],
    fulfillmentMethod: 'pickup',
  });

  assert.equal(snapshot.items[0].name, 'Kaju Katli');
  assert.equal(snapshot.items[0].unitLabel, '1 per piece');
  assert.equal(snapshot.items[0].quantity, 2);
  assert.equal(snapshot.items[0].unitPricePaise, 12999);
  assert.equal(snapshot.items[0].lineTotalPaise, 25998);
  assert.equal(snapshot.items[0].prepMinutes, 22);
  assert.equal(snapshot.totalPaise, 25998);
  assert.equal(snapshot.customerSnapshot.mobile, customer.mobile);
  assert.equal(snapshot.paymentMethod, 'in_person');
  assert.equal(snapshot.status, 'pending_owner_acceptance');
  assert.equal(Object.hasOwn(snapshot, 'token'), false);
});

test('order creation rejects unavailable/deleted products and never accepts invalid cart quantities', () => {
  for (const products of [
    [{ ...product, isAvailable: false }],
    [],
    [{ ...product, unitType: 'weight', weightUnit: 'lb' }],
  ]) {
    assert.throws(() => makeOrderSnapshot({
      customerId: CUSTOMER_ID, customer, cartLines: lines, products, fulfillmentMethod: 'pickup',
    }), { code: 'ORDER_CART_CHANGED' });
  }

  for (const cartLines of [[], [{ productId: PRODUCT_ID, quantity: 0 }], [{ productId: PRODUCT_ID, quantity: 1.5 }], [{ productId: PRODUCT_ID, quantity: 100 }]]) {
    assert.throws(() => makeOrderSnapshot({
      customerId: CUSTOMER_ID, customer, cartLines, products: [product], fulfillmentMethod: 'pickup',
    }), { code: cartLines.length ? 'ORDER_INVALID_CART' : 'CART_EMPTY' });
  }
});

test('dine-in snapshots require an active configured table and store only its verified table identity', () => {
  const diningTable = { _id: TABLE_ID, tableNumber: 'T-04', isActive: true, qrCredentialHash: 'hashed', visitId: '65a000000000000000000021' };
  const order = makeOrderSnapshot({
    customerId: CUSTOMER_ID, customer, cartLines: lines, products: [product], fulfillmentMethod: 'dine_in', diningTable,
  });
  assert.deepEqual(order.tableSnapshot, { tableId: TABLE_ID, tableNumber: 'T-04', visitId: diningTable.visitId });
  assert.throws(() => makeOrderSnapshot({
    customerId: CUSTOMER_ID, customer, cartLines: lines, products: [product], fulfillmentMethod: 'dine_in',
  }), { code: 'ORDER_TABLE_REQUIRED' });
  assert.throws(() => makeOrderSnapshot({
    customerId: CUSTOMER_ID, customer, cartLines: lines, products: [product], fulfillmentMethod: 'dine_in',
    diningTable: { ...diningTable, isActive: false },
  }), { code: 'ORDER_TABLE_REQUIRED' });
});

test('duplicate submissions resolve to one persisted order even if catalogue data later changes', async () => {
  const OrderModel = fakeOrderModel();
  const first = await placeCustomerOrder({
    ...dayDeps,
    OrderModel, customerId: CUSTOMER_ID, idempotencyKey: KEY, customer,
    cartLines: lines, products: [product], fulfillmentMethod: 'pickup',
  });
  const duplicate = await placeCustomerOrder({
    ...dayDeps,
    OrderModel, customerId: CUSTOMER_ID, idempotencyKey: KEY, customer,
    cartLines: [], products: [], fulfillmentMethod: 'pickup',
  });

  assert.equal(first.created, true);
  assert.equal(first.order.notificationOutbox[0].eventType, 'order_placed');
  assert.equal(first.order.notificationOutbox[0].recipientType, 'owner');
  assert.equal(first.order.notificationOutbox[0].eventKey, `${String(first.order._id)}:order_placed`);
  assert.equal(duplicate.created, false);
  assert.equal(String(first.order._id), String(duplicate.order._id));
  assert.equal(OrderModel.records.size, 1);
  assert.notEqual(String(orderIdFor(CUSTOMER_ID, KEY)), String(orderIdFor(OTHER_CUSTOMER_ID, KEY)));
});

test('concurrent double submissions converge on one order', async () => {
  const OrderModel = fakeOrderModel();
  const input = {
    ...dayDeps,
    OrderModel, customerId: CUSTOMER_ID, idempotencyKey: KEY, customer,
    cartLines: lines, products: [product], fulfillmentMethod: 'pickup',
  };
  const [first, second] = await Promise.all([
    placeCustomerOrder(input),
    placeCustomerOrder(input),
  ]);
  assert.equal(OrderModel.records.size, 1);
  assert.equal(String(first.order._id), String(second.order._id));
  assert.deepEqual([first.created, second.created].sort(), [false, true]);
});

test('cart is retained when order persistence fails and clears only after an order is persisted', async () => {
  const session = { cart: [...lines], checkoutKey: KEY };
  await assert.rejects(placeCustomerOrder({
    ...dayDeps,
    OrderModel: fakeOrderModel({ failCreate: true }), customerId: CUSTOMER_ID, idempotencyKey: KEY,
    customer, cartLines: lines, products: [product], fulfillmentMethod: 'pickup',
  }), /database write failed/);
  assert.deepEqual(session.cart, lines);
  assert.throws(() => clearCartAfterPersistedOrder(session, null), /persisted order/);
  assert.deepEqual(session.cart, lines);

  const savedOrder = (await placeCustomerOrder({
    ...dayDeps,
    OrderModel: fakeOrderModel(), customerId: CUSTOMER_ID, idempotencyKey: KEY,
    customer, cartLines: lines, products: [product], fulfillmentMethod: 'pickup',
  })).order;
  clearCartAfterPersistedOrder(session, savedOrder);
  assert.deepEqual(session.cart, []);
  assert.equal(session.checkoutKey, undefined);
});

test('a dine-in order keeps its verified visit context for another order in the same visit', () => {
  const session = { cart: [...lines], dineInTableId: TABLE_ID, dineInCredentialHash: 'secure-digest' };
  clearCartAfterPersistedOrder(session, { _id: 'order-1', fulfillmentMethod: 'dine_in', tableSnapshot: { tableId: TABLE_ID, visitId: '65a000000000000000000021' } });
  assert.deepEqual(session.cart, []);
  assert.equal(session.dineInTableId, TABLE_ID);
  assert.equal(session.dineInCredentialHash, 'secure-digest');
  assert.equal(session.dineInVisitId, '65a000000000000000000021');
});

test('checkout is rejected when the business day is closing and the cart remains untouched', async () => {
  const OrderModel = fakeOrderModel();
  const session = { cart: [...lines], checkoutKey: KEY };
  await assert.rejects(placeCustomerOrder({
    ...dayDeps, BusinessDayModel: fakeBusinessDayModel('closing'), OrderModel,
    customerId: CUSTOMER_ID, idempotencyKey: KEY, customer, cartLines: lines,
    products: [product], fulfillmentMethod: 'pickup',
  }), { code: 'BUSINESS_DAY_NOT_OPEN' });
  assert.equal(OrderModel.records.size, 0);
  assert.deepEqual(session.cart, lines);
  assert.equal(session.checkoutKey, KEY);
});

test('order lookup includes the authenticated customer ID to enforce ownership', async () => {
  const OrderModel = fakeOrderModel();
  const saved = await placeCustomerOrder({
    ...dayDeps,
    OrderModel, customerId: CUSTOMER_ID, idempotencyKey: KEY, customer,
    cartLines: lines, products: [product], fulfillmentMethod: 'pickup',
  });
  assert.ok(await findCustomerOrder(OrderModel, saved.order._id, CUSTOMER_ID));
  assert.equal(await findCustomerOrder(OrderModel, saved.order._id, OTHER_CUSTOMER_ID), null);
});
