const Product = require('../models/product.model');
const ProductCategory = require('../models/product-category.model');
const { activeCategoryVisibilityFilter } = require('../services/product-category.service');
const { buildCartView, ensureCustomerCart } = require('../services/customer-cart.service');

async function loadCustomerCart(req, res, next) {
  try {
    const cart = ensureCustomerCart(req.session, req.authAccount._id);
    const activeCategoryIds = await ProductCategory.distinct('_id', { isActive: true });
    const products = cart.length
      ? await Product.find({ _id: { $in: cart.map((item) => item.productId) }, ...activeCategoryVisibilityFilter(activeCategoryIds) })
        .populate('categoryId', 'name slug isActive').lean()
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
