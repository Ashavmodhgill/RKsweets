const Product = require('../models/product.model');
const ProductCategory = require('../models/product-category.model');
const { activeCategoryVisibilityFilter } = require('../services/product-category.service');
const {
  addCartItem,
  isPurchasableProduct,
  removeCartItem,
  updateCartItem,
} = require('../services/customer-cart.service');

const CART_NOTICES = Object.freeze({
  added: 'Added to your cart.',
  updated: 'Cart updated.',
  removed: 'Item removed from your cart.',
  unavailable: 'That sweet is unavailable and has been removed from your cart.',
  quantityLimit: 'A cart item cannot exceed 99 units.',
  notFound: 'That item is no longer in your cart.',
  emptyCheckout: 'Your cart is empty. Add available sweets before checkout.',
});

function saveAndRedirect(req, res, next, notice) {
  req.session.save((error) => {
    if (error) return next(error);
    return res.redirect(303, `/cart?notice=${notice}`);
  });
}

function show(req, res) {
  const noticeKey = typeof req.query.notice === 'string' ? req.query.notice : '';
  const notice = Object.hasOwn(CART_NOTICES, noticeKey) ? CART_NOTICES[noticeKey] : '';
  return res.render('customer/views/pages/cart', {
    pageTitle: 'Your cart',
    account: req.authAccount,
    cart: req.customerCart,
    notice,
  });
}

async function add(req, res, next) {
  try {
    const { productId } = req.validated.params;
    const activeCategoryIds = await ProductCategory.distinct('_id', { isActive: true });
    const product = await Product.findOne({ _id: productId, ...activeCategoryVisibilityFilter(activeCategoryIds) })
      .populate('categoryId', 'isActive').lean();
    if (!isPurchasableProduct(product)) {
      return res.redirect(303, '/cart?notice=unavailable');
    }

    try {
      req.session.cart = addCartItem(req.session.cart, productId, req.validated.body.quantity);
    } catch (error) {
      if (error.code === 'CART_QUANTITY_LIMIT') return res.redirect(303, '/cart?notice=quantityLimit');
      throw error;
    }
    return saveAndRedirect(req, res, next, 'added');
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const { productId } = req.validated.params;
    const existing = req.session.cart?.some((item) => item.productId === productId);
    if (!existing) return res.redirect(303, '/cart?notice=notFound');

    const activeCategoryIds = await ProductCategory.distinct('_id', { isActive: true });
    const product = await Product.findOne({ _id: productId, ...activeCategoryVisibilityFilter(activeCategoryIds) })
      .populate('categoryId', 'isActive').lean();
    if (!isPurchasableProduct(product)) {
      req.session.cart = removeCartItem(req.session.cart, productId);
      return saveAndRedirect(req, res, next, 'unavailable');
    }

    req.session.cart = updateCartItem(req.session.cart, productId, req.validated.body.quantity);
    return saveAndRedirect(req, res, next, 'updated');
  } catch (error) {
    return next(error);
  }
}

function remove(req, res, next) {
  const { productId } = req.validated.params;
  req.session.cart = removeCartItem(req.session.cart, productId);
  return saveAndRedirect(req, res, next, 'removed');
}

module.exports = { add, remove, show, update };
