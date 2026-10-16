const Product = require('../models/product.model');

async function home(req, res, next) {
  try {
    const [totalProducts, availableProducts, recentProducts] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ isAvailable: true }),
      Product.find().populate('categoryId', 'name isActive').sort({ updatedAt: -1 }).limit(6).lean(),
    ]);
    return res.render('admin/views/pages/home', {
      pageTitle: 'Dashboard', account: req.authAccount,
      metrics: { totalProducts, availableProducts, unavailableProducts: totalProducts - availableProducts }, recentProducts,
    });
  } catch (error) { return next(error); }
}

module.exports = { home };
