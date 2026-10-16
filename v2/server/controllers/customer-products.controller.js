const Product = require('../models/product.model');
const ProductCategory = require('../models/product-category.model').ProductCategory;
const { activeCategoryVisibilityFilter, selectActiveCategory } = require('../services/product-category.service');

function publicProduct(product) {
  return {
    _id: String(product._id),
    slug: product.slug,
    name: product.name,
    description: product.description,
    category: product.categoryId?.name || product.category || 'Sweets',
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
    const requestedSlug = typeof req.query.category === 'string' ? req.query.category.trim().toLowerCase() : '';
    const categories = await ProductCategory.find({ isActive: true }).sort({ name: 1 }).lean();
    const selected = selectActiveCategory(categories, requestedSlug);
    let products = [];
    if (!requestedSlug) {
      products = await Product.find(activeCategoryVisibilityFilter(categories.map((category) => category._id)))
        .populate('categoryId', 'name slug isActive').sort({ name: 1 }).lean();
    } else if (selected) {
      products = await Product.find({ categoryId: selected._id })
        .populate('categoryId', 'name slug isActive').sort({ name: 1 }).lean();
    }
    return res.render('customer/views/pages/products', {
      pageTitle: 'Our sweets', account: req.authAccount, products: products.map(publicProduct),
      categories, selectedCategory: selected?.slug || '',
      selectedCategoryName: selected?.name || (requestedSlug ? 'Category unavailable' : ''),
      invalidCategory: Boolean(requestedSlug && !selected),
    });
  } catch (error) { return next(error); }
}

async function detail(req, res, next) {
  try {
    const product = await Product.findOne({ slug: req.params.slug }).lean();
    if (product?.categoryId) {
      product.categoryId = await ProductCategory.findOne({ _id: product.categoryId, isActive: true })
        .select('name slug isActive').lean();
    }
    if (!product || (product.categoryId === null)) return res.status(404).render('server/views/shared/error', {
      pageTitle: 'Product not found', statusCode: 404, message: 'That sweet could not be found.', details: [], portalPath: '/',
    });
    return res.render('customer/views/pages/product-detail', {
      pageTitle: product.name, account: req.authAccount, product: publicProduct(product),
    });
  } catch (error) { return next(error); }
}

module.exports = { list, detail };
