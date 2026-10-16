const crypto = require('node:crypto');
const mongoose = require('mongoose');
const BusinessDay = require('../models/business-day.model');
const { touchOpenBusinessDay } = require('./business-day.service');
const { MAX_ITEM_QUANTITY, isPurchasableProduct, productUnitLabel } = require('./customer-cart.service');
const { ownerOrderPlacedEvent } = require('../constants/notification-events');
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function orderCartLines(cartLines) {
  if (!Array.isArray(cartLines) || cartLines.length === 0) {
    throw codedError('CART_EMPTY', 'The cart is empty.');
  }
  const merged = new Map();
  for (const line of cartLines) {
    if (!OBJECT_ID_PATTERN.test(line?.productId || '')
      || !Number.isInteger(line?.quantity)
      || line.quantity < 1
      || line.quantity > MAX_ITEM_QUANTITY) {
      throw codedError('ORDER_INVALID_CART', 'A cart quantity is invalid. Review your cart and try again.');
    }
    const productId = line.productId.toLowerCase();
    const quantity = (merged.get(productId) || 0) + line.quantity;
    if (quantity > MAX_ITEM_QUANTITY) {
      throw codedError('ORDER_INVALID_CART', 'A cart quantity is invalid. Review your cart and try again.');
    }
    merged.set(productId, quantity);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

function orderIdFor(customerId, idempotencyKey) {
  const digest = crypto.createHash('sha256')
    .update(`${String(customerId)}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 24);
  return new mongoose.Types.ObjectId(digest);
}

function makeOrderSnapshot({ customerId, customer, cartLines, products, fulfillmentMethod, diningTable }) {
  const lines = orderCartLines(cartLines);
  if (!['pickup', 'dine_in'].includes(fulfillmentMethod)) {
    throw codedError('ORDER_INVALID_FULFILLMENT', 'Choose a valid fulfilment method.');
  }
  if (fulfillmentMethod === 'dine_in'
    && (diningTable?.isActive !== true || !diningTable?._id || !diningTable?.tableNumber)) {
    throw codedError('ORDER_TABLE_REQUIRED', 'Scan a valid table QR code to place a dine-in order.');
  }

  const productsById = new Map(products.map((product) => [String(product._id), product]));
  const items = lines.map((line) => {
    const product = productsById.get(line.productId);
    const unitLabel = product && productUnitLabel(product);
    if (!isPurchasableProduct(product) || !unitLabel
      || !Number.isSafeInteger(product.prepMinutes) || product.prepMinutes < 0) {
      throw codedError('ORDER_CART_CHANGED', 'A cart item is no longer available. Review your cart and try again.');
    }
    const lineTotalPaise = product.pricePaise * line.quantity;
    if (!Number.isSafeInteger(lineTotalPaise)) {
      throw codedError('ORDER_TOTAL_INVALID', 'The order total could not be calculated.');
    }
    return {
      productId: product._id,
      name: product.name,
      unitType: product.unitType,
      unitLabel,
      quantity: line.quantity,
      unitPricePaise: product.pricePaise,
      lineTotalPaise,
      prepMinutes: product.prepMinutes,
    };
  });

  const totalPaise = items.reduce((sum, item) => sum + item.lineTotalPaise, 0);
  if (!Number.isSafeInteger(totalPaise)) {
    throw codedError('ORDER_TOTAL_INVALID', 'The order total could not be calculated.');
  }

  return {
    customerId,
    customerSnapshot: { name: customer.name, mobile: customer.mobile },
    items,
    fulfillmentMethod,
    ...(fulfillmentMethod === 'dine_in'
      ? { tableSnapshot: { tableId: diningTable._id, tableNumber: diningTable.tableNumber } }
      : {}),
    totalPaise,
    paymentMethod: 'in_person',
    status: 'pending_owner_acceptance',
  };
}

async function findExistingOrder(OrderModel, orderId, customerId) {
  return findCustomerOrder(OrderModel, orderId, customerId);
}

async function findCustomerOrder(OrderModel, orderId, customerId) {
  return OrderModel.findOne({ _id: orderId, customerId }).lean();
}

function clearCartAfterPersistedOrder(session, order) {
  if (!order?._id) throw new TypeError('A persisted order is required before clearing the cart.');
  session.cart = [];
  delete session.checkoutQuote;
  delete session.checkoutKey;
  delete session.dineInTableId;
}

async function placeCustomerOrder({
  OrderModel,
  BusinessDayModel = BusinessDay,
  customerId,
  businessDate,
  idempotencyKey,
  customer,
  cartLines,
  products,
  fulfillmentMethod,
  diningTable,
  startSession = () => mongoose.startSession(),
}) {
  const orderId = orderIdFor(customerId, idempotencyKey);
  const existing = await findExistingOrder(OrderModel, orderId, customerId);
  if (existing) return { order: existing, created: false };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate || '')) {
    throw codedError('BUSINESS_DAY_NOT_OPEN', 'Ordering is currently closed. Please try again after the owner opens the business day.');
  }

  const snapshot = makeOrderSnapshot({
    customerId, customer, cartLines, products, fulfillmentMethod, diningTable,
  });
  const session = await startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      await touchOpenBusinessDay({ date: businessDate, BusinessDayModel, session });
      const [created] = await OrderModel.create([{
        _id: orderId,
        ...snapshot,
        businessDate,
        notificationOutbox: [ownerOrderPlacedEvent({ _id: orderId })],
      }], { session });
      order = created;
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    return { order, created: true };
  } catch (error) {
    // The deterministic order id is backed by MongoDB's built-in _id uniqueness.
    if (error?.code === 11000) {
      const duplicate = await findExistingOrder(OrderModel, orderId, customerId);
      if (duplicate) return { order: duplicate, created: false };
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  clearCartAfterPersistedOrder,
  findCustomerOrder,
  makeOrderSnapshot,
  orderCartLines,
  orderIdFor,
  placeCustomerOrder,
};
