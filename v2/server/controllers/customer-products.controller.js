const Product = require('../models/product.model');

function publicProduct(product) {
  return {
    slug: product.slug,
    name: product.name,
    description: product.description,
    category: product.category,
    pricePaise: product.pricePaise,
    unitType: product.unitType,
    ...(product.unitType === 'weight'
      ? { weightAmount: product.weightAmount, weightUnit: product.weightUnit }
      : { quantityPerPiece: product.quantityPerPiece }),
    imageUrl: product.imageUrl,
    prepMinutes: product.prepMinutes,
    isAvailable: product.isAvailable,
  };
}

async function list(req, res, next) {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 60) : '';
    const [products, categories] = await Promise.all([
      Product.find(category ? { category } : {}).sort({ category: 1, name: 1 }).lean(),
      Product.distinct('category'),
    ]);
    return res.render('customer/views/pages/products', {
      pageTitle: 'Our sweets', account: req.authAccount, products: products.map(publicProduct),
      categories: categories.sort((a, b) => a.localeCompare(b)), selectedCategory: category,
    });
  } catch (error) { return next(error); }
}

async function detail(req, res, next) {
  try {
    const product = await Product.findOne({ slug: req.params.slug }).lean();
    if (!product) return res.status(404).render('server/views/shared/error', {
      pageTitle: 'Product not found', statusCode: 404, message: 'That sweet could not be found.', details: [], portalPath: '/',
    });
    return res.render('customer/views/pages/product-detail', {
      pageTitle: product.name, account: req.authAccount, product: publicProduct(product),
    });
  } catch (error) { return next(error); }
}

module.exports = { list, detail };
