const Product = require('../models/product.model');

async function home(req, res, next) {
  try {
    const [featuredProducts, categories] = await Promise.all([
      Product.find({ isAvailable: true }).sort({ updatedAt: -1, name: 1 }).limit(4).lean(),
      Product.distinct('category', { isAvailable: true }),
    ]);
    return res.render('customer/views/pages/home', {
      pageTitle: 'RK Sweets', account: req.authAccount,
      featuredProducts, categories: categories.sort((a, b) => a.localeCompare(b)),
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
