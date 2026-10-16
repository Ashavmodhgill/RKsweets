const mongoose = require('mongoose');
const ProductCategory = require('../models/product-category.model').ProductCategory;
const {
  categorySlugBase, normalizeCategoryName, normalizedCategoryKey,
} = require('../models/product-category.model');

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function uniqueCategorySlug(name, CategoryModel = ProductCategory) {
  const base = categorySlugBase(name);
  let slug = base;
  let suffix = 2;
  while (await CategoryModel.exists({ slug })) slug = `${base}-${suffix++}`;
  return slug;
}

async function createCategory(name, { CategoryModel = ProductCategory } = {}) {
  const normalizedName = normalizeCategoryName(name);
  if (normalizedName.length < 2 || normalizedName.length > 60) {
    throw codedError('CATEGORY_NAME_INVALID', 'Category names must be 2 to 60 characters.');
  }
  const key = normalizedCategoryKey(normalizedName);
  if (await CategoryModel.exists({ normalizedName: key })) {
    throw codedError('CATEGORY_DUPLICATE', 'A category with that name already exists.');
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await CategoryModel.create({
        name: normalizedName,
        normalizedName: key,
        slug: await uniqueCategorySlug(normalizedName, CategoryModel),
        isActive: true,
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      if (await CategoryModel.exists({ normalizedName: key })) {
        throw codedError('CATEGORY_DUPLICATE', 'A category with that name already exists.');
      }
    }
  }
  throw codedError('CATEGORY_SLUG_CONFLICT', 'A unique category slug could not be created. Try again.');
}

async function resolveProductCategory({ categoryId, existingProduct, CategoryModel = ProductCategory }) {
  const existingId = existingProduct?.categoryId?._id || existingProduct?.categoryId;
  if (!categoryId) return existingId || null;
  if (!mongoose.isValidObjectId(categoryId)) {
    throw codedError('CATEGORY_INVALID', 'Choose a valid product category.');
  }

  const requestedId = String(categoryId);
  if (existingId && String(existingId) === requestedId) {
    // Preserve an existing inactive or temporarily unresolved association during unrelated edits.
    return existingId;
  }

  const activeCategory = await CategoryModel.findOne({ _id: requestedId, isActive: true }).select('_id').lean();
  if (!activeCategory) throw codedError('CATEGORY_INACTIVE', 'Choose an active product category.');
  return activeCategory._id;
}

function activeCategoryVisibilityFilter(activeCategoryIds) {
  const legacyProducts = [
    { categoryId: { $exists: false } },
    { categoryId: null },
  ];
  if (!activeCategoryIds.length) return { $or: legacyProducts };
  return { $or: [
    { categoryId: { $in: activeCategoryIds } },
    ...legacyProducts,
  ] };
}

function productFilterForCategory(categoryId) {
  return categoryId ? { categoryId } : {};
}

function selectActiveCategory(categories, requestedSlug) {
  if (typeof requestedSlug !== 'string' || !requestedSlug) return null;
  return categories.find((category) => category.slug === requestedSlug) || null;
}

function categoryProductListing(activeCategoryIds, categoryId) {
  if (categoryId) return productFilterForCategory(categoryId);
  return activeCategoryVisibilityFilter(activeCategoryIds);
}

module.exports = {
  activeCategoryVisibilityFilter,
  categoryProductListing,
  codedError,
  createCategory,
  normalizeCategoryName,
  normalizedCategoryKey,
  resolveProductCategory,
  selectActiveCategory,
  uniqueCategorySlug,
};
