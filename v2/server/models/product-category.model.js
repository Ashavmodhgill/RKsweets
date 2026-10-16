const mongoose = require('mongoose');

function normalizeCategoryName(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ')
    : '';
}

function normalizedCategoryKey(value) {
  return normalizeCategoryName(value).toLocaleLowerCase('en-US');
}

function categorySlugBase(value) {
  return normalizeCategoryName(value).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 80) || 'category';
}

const productCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
  normalizedName: { type: String, required: true, lowercase: true, maxlength: 60 },
  slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 100 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, strict: 'throw', collection: 'product_categories' });

productCategorySchema.pre('validate', function normalizeCategory() {
  this.name = normalizeCategoryName(this.name);
  this.normalizedName = normalizedCategoryKey(this.name);
  if (!this.slug) this.slug = categorySlugBase(this.name);
});

productCategorySchema.index({ normalizedName: 1 }, { unique: true, name: 'unique_product_category_name' });
productCategorySchema.index({ slug: 1 }, { unique: true, name: 'unique_product_category_slug' });
productCategorySchema.index({ isActive: 1, name: 1 }, { name: 'active_product_category_list' });

const ProductCategory = mongoose.models.ProductCategory
  || mongoose.model('ProductCategory', productCategorySchema, 'product_categories');

module.exports = ProductCategory;
module.exports.ProductCategory = ProductCategory;
module.exports.categorySlugBase = categorySlugBase;
module.exports.normalizeCategoryName = normalizeCategoryName;
module.exports.normalizedCategoryKey = normalizedCategoryKey;
