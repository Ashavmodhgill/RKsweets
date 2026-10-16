const {
  categorySlugBase, normalizeCategoryName, normalizedCategoryKey,
} = require('../models/product-category.model');

function buildMigrationPlan(products, categories) {
  const categoriesById = new Map(categories.map((category) => [String(category._id), category]));
  const categoriesByName = new Map();
  const existingSlugs = new Map();
  const ambiguous = [];
  for (const category of categories) {
    const key = category.normalizedName || normalizedCategoryKey(category.name);
    const priorName = categoriesByName.get(key);
    if (priorName && String(priorName._id) !== String(category._id)) {
      ambiguous.push({ category: category.name, reason: 'duplicate normalized name already exists in product_categories' });
    }
    const priorSlugKey = existingSlugs.get(category.slug);
    if (priorSlugKey && priorSlugKey !== key) {
      ambiguous.push({ category: category.name, slug: category.slug, reason: 'duplicate slug already exists in product_categories' });
    }
    categoriesByName.set(key, category);
    existingSlugs.set(category.slug, key);
  }

  const missing = [];
  const normalizedAliases = new Map();
  const groups = new Map();
  const productAssignments = [];

  for (const product of products) {
    if (product.categoryId) {
      const existing = categoriesById.get(String(product.categoryId));
      if (!existing) {
        ambiguous.push({ productId: String(product._id), reason: 'categoryId references no product category' });
      }
      continue;
    }

    const rawName = product.category;
    const name = normalizeCategoryName(rawName);
    if (typeof rawName !== 'string' || !name) {
      missing.push({ productId: String(product._id), valueType: typeof rawName });
      continue;
    }
    if (name.length < 2 || name.length > 60) {
      ambiguous.push({ productId: String(product._id), value: rawName, reason: 'normalized category name is outside the 2–60 character limit' });
      continue;
    }

    const key = normalizedCategoryKey(name);
    if (!normalizedAliases.has(key)) normalizedAliases.set(key, new Set());
    normalizedAliases.get(key).add(rawName);

    let group = groups.get(key);
    if (!group) {
      const existingCategory = categoriesByName.get(key);
      group = {
        key,
        name: existingCategory ? existingCategory.name : name,
        slug: existingCategory?.slug || categorySlugBase(name),
        categoryId: existingCategory?._id || null,
        productRows: [],
      };
      groups.set(key, group);
    }
    group.productRows.push({ _id: product._id, legacyCategory: rawName });
    productAssignments.push({ productId: product._id, normalizedName: key, legacyCategory: rawName });
  }

  const pendingSlugs = new Map();
  for (const group of groups.values()) {
    const existingKey = existingSlugs.get(group.slug) || pendingSlugs.get(group.slug);
    if (existingKey && existingKey !== group.key) {
      ambiguous.push({ category: group.name, slug: group.slug, reason: 'slug collision between distinct normalized category names' });
    } else {
      pendingSlugs.set(group.slug, group.key);
    }
  }

  return {
    groups: [...groups.values()],
    missing,
    ambiguous,
    normalizedAliases: [...normalizedAliases.entries()]
      .filter(([, values]) => values.size > 1)
      .map(([normalizedName, values]) => ({ normalizedName, originalValues: [...values] })),
    productAssignments,
  };
}

async function migrateLegacyProductCategories({ ProductModel, CategoryModel, apply = false }) {
  const [products, categories] = await Promise.all([
    ProductModel.find({}, { _id: 1, category: 1, categoryId: 1 }).lean(),
    CategoryModel.find({}, { _id: 1, name: 1, normalizedName: 1, slug: 1 }).lean(),
  ]);
  const plan = buildMigrationPlan(products, categories);
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    scannedProducts: products.length,
    categoriesToResolve: plan.groups.length,
    productsToReference: plan.productAssignments.length,
    missing: plan.missing,
    ambiguous: plan.ambiguous,
    normalizedAliases: plan.normalizedAliases,
    applied: false,
  };
  if (plan.missing.length || plan.ambiguous.length || !apply) return report;

  const resolved = new Map();
  for (const group of plan.groups) {
    let category = group.categoryId ? { _id: group.categoryId } : null;
    if (!category) {
      category = await CategoryModel.findOneAndUpdate(
        { normalizedName: group.key },
        { $setOnInsert: { name: group.name, normalizedName: group.key, slug: group.slug, isActive: true } },
        { upsert: true, new: true, runValidators: true },
      ).lean();
    }
    if (!category?._id) throw new Error('Could not resolve a product category during migration.');
    resolved.set(group.key, category._id);
  }

  for (const assignment of plan.productAssignments) {
    const categoryId = resolved.get(assignment.normalizedName);
    const result = await ProductModel.updateOne(
      {
        _id: assignment.productId,
        $or: [{ categoryId: { $exists: false } }, { categoryId: null }],
        category: assignment.legacyCategory,
      },
      { $set: { categoryId } },
      { runValidators: true },
    );
    if (result.matchedCount !== 1 && result.modifiedCount !== 1) {
      throw new Error(`Product ${String(assignment.productId)} changed during migration; rerun the dry-run and inspect the partial state.`);
    }
  }

  report.applied = true;
  return report;
}

module.exports = { buildMigrationPlan, migrateLegacyProductCategories };
