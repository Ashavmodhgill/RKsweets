const Product = require('../models/product.model');
const { buildCartView, ensureCustomerCart } = require('../services/customer-cart.service');

async function loadCustomerCart(req, res, next) {
  try {
    const cart = ensureCustomerCart(req.session, req.authAccount._id);
    const products = cart.length
      ? await Product.find({ _id: { $in: cart.map((item) => item.productId) } }).lean()
      : [];
    const cartView = buildCartView(cart, products);

    req.session.cart = cartView.cart;
    req.customerCart = cartView;
    res.locals.cartItemCount = cartView.itemCount;
    res.locals.cartNotice = cartView.removedCount
      ? 'Unavailable or removed products were cleared from your cart.'
      : '';
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { loadCustomerCart };
