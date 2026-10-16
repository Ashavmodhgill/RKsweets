const ProductCategory = require('../models/product-category.model').ProductCategory;
const { createCategory, normalizeCategoryName, normalizedCategoryKey } = require('../services/product-category.service');

async function renderCategories(req, res, { status = 200, error = '', values = {} } = {}) {
  const categories = await ProductCategory.find().sort({ name: 1 }).lean();
  return res.status(status).render('admin/views/pages/categories', {
    pageTitle: 'Product categories', account: req.authAccount,
    categories, error, notice: '', values,
  });
}

async function list(req, res, next) {
  try {
    const notices = {
      created: 'Category added.', updated: 'Category updated.',
      activated: 'Category is now active in the customer catalogue.',
      deactivated: 'Category is hidden from the customer catalogue.',
      'not-found': 'That category could not be found.',
    };
    const categories = await ProductCategory.find().sort({ name: 1 }).lean();
    return res.render('admin/views/pages/categories', {
      pageTitle: 'Product categories', account: req.authAccount, categories,
      error: '', notice: notices[req.query.notice] || '', values: {},
    });
  } catch (error) { return next(error); }
}

async function create(req, res, next) {
  const name = normalizeCategoryName(req.validated.body.name);
  try {
    await createCategory(name);
    return res.redirect(303, '/categories?notice=created');
  } catch (error) {
    if (['CATEGORY_DUPLICATE', 'CATEGORY_NAME_INVALID'].includes(error.code) || error.code === 11000) {
      return renderCategories(req, res, {
        status: error.code === 'CATEGORY_DUPLICATE' || error.code === 11000 ? 409 : 400,
        error: error.code === 'CATEGORY_DUPLICATE' || error.code === 11000
          ? 'A category with that name already exists.' : error.message,
        values: { name },
      }).catch(next);
    }
    return next(error);
  }
}

async function update(req, res, next) {
  const name = normalizeCategoryName(req.validated.body.name);
  try {
    const id = req.validated.params.id;
    const normalizedName = normalizedCategoryKey(name);
    const duplicate = await ProductCategory.exists({ normalizedName, _id: { $ne: id } });
    if (duplicate) return renderCategories(req, res, {
      status: 409, error: 'A category with that name already exists.',
    });
    const category = await ProductCategory.findByIdAndUpdate(id, {
      $set: { name, normalizedName },
    }, { new: true, runValidators: true });
    if (!category) return res.redirect(303, '/categories?notice=not-found');
    return res.redirect(303, '/categories?notice=updated');
  } catch (error) {
    if (error.code === 11000) return renderCategories(req, res, {
      status: 409, error: 'A category with that name already exists.',
    });
    return next(error);
  }
}

async function setStatus(req, res, next) {
  try {
    const category = await ProductCategory.findByIdAndUpdate(req.validated.params.id, {
      $set: { isActive: req.validated.body.isActive },
    }, { new: true, runValidators: true });
    if (!category) return res.redirect(303, '/categories?notice=not-found');
    return res.redirect(303, `/categories?notice=${category.isActive ? 'activated' : 'deactivated'}`);
  } catch (error) { return next(error); }
}

module.exports = { create, list, setStatus, update };
