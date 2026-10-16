const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..', '..');
const ORDER_ID = '65a000000000000000000099';

async function render(relativePath, locals) {
  return ejs.renderFile(path.join(ROOT, relativePath), locals);
}

const order = {
  _id: ORDER_ID,
  customerSnapshot: { name: 'Riya Shah', mobile: '+919876543210' },
  createdAt: new Date('2026-10-16T10:00:00Z'),
  fulfillmentMethod: 'pickup',
  items: [{ name: 'Kaju Katli', unitLabel: '1 per piece', quantity: 1, lineTotalPaise: 12500 }],
  totalPaise: 12500,
  status: 'pending_owner_acceptance',
};

test('owner order detail and sidebar render navigation to the existing owner receipt flow', async () => {
  const shell = await render('admin/views/partials/sidebar.ejs', {
    activePath: '/orders', csrfToken: 'test-csrf',
  });
  assert.match(shell, /href="\/orders"[^>]*>[\s\S]*?Receipts/);

  const detail = await render('admin/views/pages/order-detail.ejs', {
    pageTitle: 'Order', assetPrefix: '/assets', account: { name: 'Owner' },
    activePath: '/orders', csrfToken: 'test-csrf', order, labels: {},
    suggestedPrepMinutes: 0, businessDayStatus: 'open', notice: '',
  });
  assert.match(detail, new RegExp(`href="/orders/${ORDER_ID}/receipt"`));

  const notFound = await render('admin/views/pages/order-detail.ejs', {
    pageTitle: 'Order not found', assetPrefix: '/assets', account: { name: 'Owner' },
    activePath: '/orders', csrfToken: 'test-csrf', order: null, labels: {},
    suggestedPrepMinutes: 0, businessDayStatus: null, notice: '',
  });
  assert.doesNotMatch(notFound, /\/orders\/[a-f\d]{24}\/receipt/);
});

test('customer history and order confirmation render receipt links with that order ID', async () => {
  const shared = {
    pageTitle: 'My orders', assetPrefix: '/assets', account: { name: 'Riya Shah' },
    activePath: '/orders', csrfToken: 'test-csrf',
  };
  const history = await render('customer/views/pages/orders.ejs', {
    ...shared, orders: [order], page: 1, pages: 1, total: 1,
    pendingStatus: 'pending_owner_acceptance',
  });
  assert.match(history, new RegExp(`href="/orders/${ORDER_ID}/receipt"`));

  const confirmation = await render('customer/views/pages/order-confirmation.ejs', {
    ...shared, pageTitle: 'Order received', order,
  });
  assert.match(confirmation, new RegExp(`href="/orders/${ORDER_ID}/receipt"`));
});
