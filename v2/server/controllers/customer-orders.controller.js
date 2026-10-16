const crypto = require('node:crypto');
const DiningTable = require('../models/dining-table.model');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const { buildCartView } = require('../services/customer-cart.service');
const { ORDER_STATUS } = require('../constants/order-status');
const {
  clearCartAfterPersistedOrder,
  findCustomerOrder,
  orderIdFor,
  placeCustomerOrder,
} = require('../services/customer-order.service');

function cartQuote(cart) {
  return JSON.stringify(cart.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    pricePaise: item.pricePaise,
    unitLabel: item.unitLabel,
  })));
}

async function resolveDiningTable(req, qrTableNumber) {
  if (typeof qrTableNumber === 'string' && qrTableNumber.trim()) {
    if (qrTableNumber.trim().length > 32) {
      delete req.session.dineInTableId;
      return { table: null, invalidQr: true };
    }
    const table = await DiningTable.findOne({
      tableNumber: qrTableNumber.trim(),
      isActive: true,
    }).lean();
    if (!table) {
      delete req.session.dineInTableId;
      return { table: null, invalidQr: true };
    }
    req.session.dineInTableId = String(table._id);
    return { table, invalidQr: false };
  }

  const tableId = req.session.dineInTableId;
  if (typeof tableId !== 'string' || !/^[a-f\d]{24}$/i.test(tableId)) {
    delete req.session.dineInTableId;
    return { table: null, invalidQr: false };
  }
  const table = await DiningTable.findOne({ _id: tableId, isActive: true }).lean();
  if (!table) delete req.session.dineInTableId;
  return { table, invalidQr: false };
}

function renderCheckout(req, res, { status = 200, errorMessage = '', diningTable = null, invalidQr = false } = {}) {
  return res.status(status).render('customer/views/pages/checkout', {
    pageTitle: 'Checkout',
    account: req.authAccount,
    cart: req.customerCart,
    checkoutKey: req.session.checkoutKey,
    diningTable,
    invalidQr,
    errorMessage,
  });
}

async function showCheckout(req, res, next) {
  try {
    const { table, invalidQr } = await resolveDiningTable(req, req.query.table);
    if (!req.customerCart.items.length) return res.redirect(303, '/cart?notice=emptyCheckout');
    req.session.checkoutKey = crypto.randomUUID();
    req.session.checkoutQuote = cartQuote(req.customerCart);
    return renderCheckout(req, res, {
      diningTable: table,
      invalidQr,
      errorMessage: invalidQr ? 'That table QR is not active. Choose pickup or scan a current table QR.' : '',
    });
  } catch (error) {
    return next(error);
  }
}

async function place(req, res, next) {
  try {
    const { fulfillmentMethod, idempotencyKey } = req.validated.body;
    const customerId = req.authAccount._id;
    const orderId = orderIdFor(customerId, idempotencyKey);
    const alreadyPlaced = await findCustomerOrder(Order, orderId, customerId);
    if (alreadyPlaced) return finishOrder(req, res, alreadyPlaced._id);

    if (req.session.checkoutKey !== idempotencyKey || !req.session.checkoutQuote) {
      const { table } = await resolveDiningTable(req);
      req.session.checkoutKey = crypto.randomUUID();
      req.session.checkoutQuote = cartQuote(req.customerCart);
      return renderCheckout(req, res, {
        status: 409,
        diningTable: table,
        errorMessage: 'Your checkout changed. Review the current items and submit again.',
      });
    }

    const products = req.customerCart.cart.length
      ? await Product.find({ _id: { $in: req.customerCart.cart.map((line) => line.productId) } }).lean()
      : [];
    const freshCart = buildCartView(req.customerCart.cart, products);
    const currentQuote = cartQuote(freshCart);
    if (req.session.checkoutQuote !== currentQuote) {
      const { table } = await resolveDiningTable(req);
      req.session.cart = freshCart.cart;
      req.customerCart = freshCart;
      req.session.checkoutKey = crypto.randomUUID();
      req.session.checkoutQuote = currentQuote;
      return renderCheckout(req, res, {
        status: 409,
        diningTable: table,
        errorMessage: 'A price, unit, or cart item changed. Review the updated order before placing it.',
      });
    }

    let diningTable = null;
    if (fulfillmentMethod === 'dine_in') {
      const tableId = req.session.dineInTableId;
      diningTable = typeof tableId === 'string'
        ? await DiningTable.findOne({ _id: tableId, isActive: true }).lean()
        : null;
      if (!diningTable) {
        const { table } = await resolveDiningTable(req);
        return renderCheckout(req, res, {
          status: 400,
          diningTable: table,
          errorMessage: 'Dine-in requires an active table QR. Scan the QR code at your table and try again.',
        });
      }
    }

    const result = await placeCustomerOrder({
      OrderModel: Order,
      customerId,
      idempotencyKey,
      customer: req.authAccount,
      cartLines: freshCart.cart,
      products,
      fulfillmentMethod,
      diningTable,
    });
    return finishOrder(req, res, result.order._id);
  } catch (error) {
    if (['CART_EMPTY', 'ORDER_INVALID_CART', 'ORDER_CART_CHANGED', 'ORDER_TABLE_REQUIRED', 'ORDER_TOTAL_INVALID'].includes(error.code)) {
      const { table } = await resolveDiningTable(req).catch(() => ({ table: null }));
      return renderCheckout(req, res, {
        status: 409,
        diningTable: table,
        errorMessage: error.message,
      });
    }
    return next(error);
  }
}

function finishOrder(req, res, orderId) {
  clearCartAfterPersistedOrder(req.session, { _id: orderId });
  return req.session.save((error) => {
    if (error) return res.app.get('env') === 'development'
      ? res.status(500).render('server/views/shared/error', {
        pageTitle: 'Order placed', statusCode: 500,
        message: 'Your order was saved, but your cart could not be cleared. Refresh the order confirmation.',
        details: [], portalPath: '/',
      })
      : res.redirect(303, `/orders/${orderId}`);
    return res.redirect(303, `/orders/${orderId}`);
  });
}

async function confirmation(req, res, next) {
  try {
    const order = await findCustomerOrder(Order, req.validated.params.orderId, req.authAccount._id);
    if (!order) {
      const error = new Error('Order not found.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      return next(error);
    }
    return res.render('customer/views/pages/order-confirmation', {
      pageTitle: 'Order received',
      account: req.authAccount,
      order,
    });
  } catch (error) {
    return next(error);
  }
}

async function history(req, res, next) {
  try {
    const page = req.validated.query.page;
    const filter = { customerId: req.authAccount._id };
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean(),
      Order.countDocuments(filter),
    ]);
    return res.render('customer/views/pages/orders', {
      pageTitle: 'My orders', account: req.authAccount, orders, page,
      pages: Math.max(1, Math.ceil(total / 20)), total,
      pendingStatus: ORDER_STATUS.PENDING,
    });
  } catch (error) { return next(error); }
}

module.exports = { confirmation, history, place, showCheckout };
