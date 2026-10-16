const Product = require('../models/product.model');
const ProductCategory = require('../models/product-category.model').ProductCategory;
const { activeCategoryVisibilityFilter } = require('../services/product-category.service');

async function home(req, res, next) {
  try {
    const categories = await ProductCategory.find({ isActive: true }).sort({ name: 1 }).lean();
    const featuredProducts = await Product.find({
      isAvailable: true,
      $and: [activeCategoryVisibilityFilter(categories.map((category) => category._id))],
    }).populate('categoryId', 'name slug isActive').sort({ updatedAt: -1, name: 1 }).limit(4).lean();
    return res.render('customer/views/pages/home', {
      pageTitle: 'RK Sweets', account: req.authAccount,
      featuredProducts: featuredProducts.map((product) => ({
        ...product, category: product.categoryId?.name || product.category || 'Sweets',
      })), categories,
    });
  } catch (error) { return next(error); }
}

function profile(req, res) {
  res.render('customer/views/pages/profile', {
    pageTitle: 'My profile',
    account: req.authAccount,
  });
}

module.exports = { home, profile };
