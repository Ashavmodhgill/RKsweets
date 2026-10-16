const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addCartItem,
  buildCartView,
  ensureCustomerCart,
  isPurchasableProduct,
  normalizeCart,
  removeCartItem,
  updateCartItem,
} = require('../services/customer-cart.service');
const { cartProductParamsSchema, cartQuantitySchema } = require('../validators/cart.validator');
const { verifyCsrf } = require('../middlewares/csrf');

const PIECE_ID = '65a000000000000000000001';
const WEIGHT_ID = '65a000000000000000000002';
const UNAVAILABLE_ID = '65a000000000000000000003';
const DELETED_ID = '65a000000000000000000004';

test('cart quantity validation accepts whole units and rejects invalid bounds or fractions', () => {
  assert.equal(cartQuantitySchema.parse({ quantity: '3' }).quantity, 3);
  for (const quantity of ['0', '1.5', '-1', '100', 'not-a-number']) {
    assert.equal(cartQuantitySchema.safeParse({ quantity }).success, false, quantity);
  }
  assert.equal(cartProductParamsSchema.parse({ productId: PIECE_ID.toUpperCase() }).productId, PIECE_ID);
  assert.equal(cartProductParamsSchema.safeParse({ productId: 'not-an-id' }).success, false);
});

test('cart adds merge duplicate product lines and retain independent customer session carts', () => {
  const firstCustomerCart = addCartItem([], PIECE_ID, 1);
  const updatedFirstCart = addCartItem(firstCustomerCart, PIECE_ID, 2);
  const secondCustomerCart = addCartItem([], WEIGHT_ID, 4);

  assert.deepEqual(updatedFirstCart, [{ productId: PIECE_ID, quantity: 3 }]);
  assert.deepEqual(secondCustomerCart, [{ productId: WEIGHT_ID, quantity: 4 }]);
  assert.deepEqual(firstCustomerCart, [{ productId: PIECE_ID, quantity: 1 }]);
  assert.throws(() => addCartItem([{ productId: PIECE_ID, quantity: 99 }], PIECE_ID, 1), { code: 'CART_QUANTITY_LIMIT' });
});

test('a cart is cleared if the authenticated customer identity on its session changes', () => {
  const session = {
    cartCustomerId: 'customer-a',
    cart: [{ productId: PIECE_ID, quantity: 2 }],
  };

  assert.deepEqual(ensureCustomerCart(session, 'customer-a'), [{ productId: PIECE_ID, quantity: 2 }]);
  assert.deepEqual(ensureCustomerCart(session, 'customer-b'), []);
  assert.equal(session.cartCustomerId, 'customer-b');
});

test('cart update and removal affect only the requested product line', () => {
  const cart = [
    { productId: PIECE_ID, quantity: 2 },
    { productId: WEIGHT_ID, quantity: 5 },
  ];

  assert.deepEqual(updateCartItem(cart, WEIGHT_ID, 3), [
    { productId: PIECE_ID, quantity: 2 },
    { productId: WEIGHT_ID, quantity: 3 },
  ]);
  assert.deepEqual(removeCartItem(cart, PIECE_ID), [{ productId: WEIGHT_ID, quantity: 5 }]);
  assert.deepEqual(updateCartItem(cart, DELETED_ID, 1), cart);
});

test('cart view drops unavailable and deleted products and recalculates from current product data', () => {
  const cart = [
    { productId: PIECE_ID, quantity: 2 },
    { productId: WEIGHT_ID, quantity: 3 },
    { productId: UNAVAILABLE_ID, quantity: 1 },
    { productId: DELETED_ID, quantity: 2 },
  ];
  const products = [
    { _id: PIECE_ID, name: 'Kaju Katli', slug: 'kaju-katli', isAvailable: true, unitType: 'piece', quantityPerPiece: 1, pricePaise: 12500, imageUrl: '' },
    { _id: WEIGHT_ID, name: 'Ladoo', slug: 'ladoo', isAvailable: true, unitType: 'weight', weightAmount: 500, weightUnit: 'g', pricePaise: 25000, imageUrl: '/ladoo.jpg' },
    { _id: UNAVAILABLE_ID, name: 'Barfi', isAvailable: false, unitType: 'piece', quantityPerPiece: 1, pricePaise: 5000 },
  ];

  // The current catalog price (₹125) is used; no price snapshot comes from the cart.
  const view = buildCartView(cart, products);
  assert.equal(view.items.length, 2);
  assert.equal(view.items[0].pricePaise, 12500);
  assert.equal(view.items[0].lineSubtotalPaise, 25000);
  assert.equal(view.items[1].unitLabel, '500 g pack');
  assert.equal(view.items[1].lineSubtotalPaise, 75000);
  assert.equal(view.totalPaise, 100000);
  assert.equal(view.itemCount, 5);
  assert.equal(view.removedCount, 2);
  assert.deepEqual(view.cart, [
    { productId: PIECE_ID, quantity: 2 },
    { productId: WEIGHT_ID, quantity: 3 },
  ]);
});

test('only available products with a schema-supported unit and current price are purchasable', () => {
  const availableWeight = { isAvailable: true, unitType: 'weight', weightAmount: 250, weightUnit: 'g', pricePaise: 1000 };
  assert.equal(isPurchasableProduct(availableWeight), true);
  assert.equal(isPurchasableProduct({ ...availableWeight, isAvailable: false }), false);
  assert.equal(isPurchasableProduct({ ...availableWeight, weightUnit: 'lb' }), false);
  assert.equal(isPurchasableProduct({ ...availableWeight, pricePaise: 10.5 }), false);
  assert.equal(isPurchasableProduct(null), false);
});

test('empty and malformed carts render as empty instead of retaining purchasable lines', () => {
  const view = buildCartView(normalizeCart([{ productId: 'bad-id', quantity: 4 }]), []);
  assert.deepEqual(view.items, []);
  assert.deepEqual(view.cart, []);
  assert.equal(view.totalPaise, 0);
  assert.equal(view.itemCount, 0);
});

test('cart state-changing requests require the existing CSRF token', () => {
  const accepted = [];
  verifyCsrf({ method: 'POST', get: () => null, body: { _csrf: 'session-token' }, session: { csrfToken: 'session-token' } }, {}, (error) => accepted.push(error));
  assert.deepEqual(accepted, [undefined]);

  const rejected = [];
  verifyCsrf({ method: 'POST', get: () => null, body: {}, session: { csrfToken: 'session-token' } }, {}, (error) => rejected.push(error?.code));
  assert.deepEqual(rejected, ['CSRF_INVALID']);
});
