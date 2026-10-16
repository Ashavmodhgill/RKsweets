const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReceiptView, formatPaise, loadOrderReceipt } = require('../services/order-receipt.service');

const ORDER_ID = '65a000000000000000000099';
const CUSTOMER_ID = '65a000000000000000000010';

function orderFixture(overrides = {}) {
  return {
    _id: ORDER_ID,
    customerId: CUSTOMER_ID,
    customerSnapshot: { name: 'Riya Shah', mobile: '+919876543210' },
    createdAt: new Date('2026-10-16T10:00:00Z'),
    fulfillmentMethod: 'pickup',
    items: [
      { name: 'Kaju Katli', unitLabel: '1 per piece', quantity: 2, unitPricePaise: 12500, lineTotalPaise: 25000 },
      { name: 'Peda', unitLabel: '500 g pack', quantity: 1, unitPricePaise: 7900, lineTotalPaise: 7900 },
    ],
    totalPaise: 32900,
    status: 'completed',
    officialToken: 7,
    tokenDate: '2026-10-16',
    suggestedPrepMinutes: 20,
    confirmedPrepMinutes: 25,
    ...overrides,
  };
}

test('paise formats as INR without using floating-point order calculations', () => {
  assert.equal(formatPaise(0), '₹0.00');
  assert.equal(formatPaise(32900), '₹329.00');
  assert.equal(formatPaise(123456789), '₹12,34,567.89');
  assert.throws(() => formatPaise(1.2), TypeError);
});

test('receipt uses persisted item snapshots, formats units and totals, and never equates completion with payment', () => {
  const receipt = buildReceiptView(orderFixture(), {
    restaurantName: 'RK Sweets Kitchen',
    businessPhone: '+911234567890',
    businessAddress: { line1: '1 Market Road', city: 'Pune' },
  });
  assert.equal(receipt.items[0].name, 'Kaju Katli');
  assert.equal(receipt.items[0].unitLabel, '1 per piece');
  assert.equal(receipt.items[0].unitPrice, '₹125.00');
  assert.equal(receipt.items[1].unitLabel, '500 g pack');
  assert.equal(receipt.items[1].lineTotal, '₹79.00');
  assert.equal(receipt.order.totalFormatted, '₹329.00');
  assert.equal(receipt.order.tokenDisplay, '2026-10-16 · 7');
  assert.equal(receipt.order.confirmedPrepMinutes, 25);
  assert.match(receipt.paymentLabel, /Payment not recorded/);
  assert.match(receipt.paymentLabel, /counter on collection/);
  assert.equal(receipt.receiptTitle, 'Order Receipt');
});

test('optional receipt fields have safe fallbacks and inconsistent stored totals are rejected', () => {
  const order = orderFixture({
    customerSnapshot: undefined, officialToken: undefined, tokenDate: undefined,
    confirmedPrepMinutes: undefined, fulfillmentMethod: undefined,
  });
  const receipt = buildReceiptView(order, null);
  assert.equal(receipt.restaurant.name, 'RK Sweets');
  assert.equal(receipt.order.tokenDisplay, '');
  assert.equal(receipt.order.fulfillmentLabel, 'Pickup');
  assert.equal(receipt.order.confirmedPrepMinutes, undefined);
  assert.throws(() => buildReceiptView(orderFixture({ totalPaise: 1 })), /stored order total is inconsistent/);
  assert.throws(() => buildReceiptView(orderFixture({ items: [{ ...orderFixture().items[0], lineTotalPaise: 1 }] })), /item totals are inconsistent/);
});

test('customer receipt lookup always scopes by authenticated customer, while owner lookup may load any order', async () => {
  const seen = [];
  const order = orderFixture();
  const query = { select() { return this; }, lean: async () => order };
  const OrderModel = {
    findOne(filter) { seen.push(['customer', filter]); return query; },
    findById(id) { seen.push(['owner', id]); return query; },
  };
  const OwnerModel = { findOne: () => query };
  await loadOrderReceipt({ OrderModel, OwnerModel, recipientType: 'customer', recipientId: CUSTOMER_ID, orderId: ORDER_ID });
  await loadOrderReceipt({ OrderModel, OwnerModel, recipientType: 'owner', recipientId: 'owner', orderId: ORDER_ID });
  assert.deepEqual(seen[0], ['customer', { _id: ORDER_ID, customerId: CUSTOMER_ID }]);
  assert.deepEqual(seen[1], ['owner', ORDER_ID]);
});
