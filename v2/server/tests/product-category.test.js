const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');
const ProductCategory = require('../models/product-category.model');
const { productFields } = require('../validators/product.validator');
const {
  activeCategoryVisibilityFilter, categoryProductListing, createCategory,
  normalizeCategoryName, normalizedCategoryKey, resolveProductCategory, selectActiveCategory,
} = require('../services/product-category.service');
const { buildMigrationPlan, migrateLegacyProductCategories } = require('../services/product-category-migration.service');
const adminRoutes = require('../routes/admin.routes');
const { requireOwner } = require('../middlewares/auth');
const { verifyCsrf } = require('../middlewares/csrf');

const CATEGORY_A = '65a000000000000000000021';
const CATEGORY_B = '65a000000000000000000022';
const PRODUCT_A = '65a000000000000000000001';
const PRODUCT_B = '65a000000000000000000002';
const PRODUCT_C = '65a000000000000000000003';
const ROOT = path.join(__dirname, '..', '..');

test('category names normalize casing and whitespace; schema and service reject duplicates', async () => {
  assert.equal(normalizeCategoryName('  Mithai   Specials  '), 'Mithai Specials');
  assert.equal(normalizedCategoryKey(' MITHAI  Specials '), 'mithai specials');
  const doc = new ProductCategory({ name: '  Mithai   Specials  ' });
  await doc.validate();
  assert.equal(doc.name, 'Mithai Specials');
  assert.equal(doc.normalizedName, 'mithai specials');
  assert.equal(doc.slug, 'mithai-specials');
  assert.ok(ProductCategory.schema.indexes().some(([keys, options]) => keys.normalizedName === 1 && options.unique));
  assert.ok(ProductCategory.schema.indexes().some(([keys, options]) => keys.slug === 1 && options.unique));

  const known = new Set();
  const fake = {
    exists: async (query) => known.has(query.normalizedName),
    create: async (values) => { known.add(values.normalizedName); return values; },
  };
  await createCategory('  Mithai   Specials ', { CategoryModel: fake });
  await assert.rejects(createCategory('MITHAI specials', { CategoryModel: fake }), { code: 'CATEGORY_DUPLICATE' });
});

test('product forms require valid category IDs and product resolution accepts only active choices', async () => {
  const valid = productFields.safeParse({
    name: 'Kaju Katli', description: 'Cashew sweet', categoryId: CATEGORY_A,
    priceRupees: '125.00', unitType: 'piece', quantityPerPiece: '1', prepMinutes: '10',
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.categoryId, CATEGORY_A);
  assert.equal(productFields.safeParse({ ...valid.data, categoryId: 'not-an-id' }).success, false);

  const fake = {
    findOne: (filter) => ({ select() { return this; }, lean: async () => filter._id === CATEGORY_A && filter.isActive ? { _id: CATEGORY_A } : null }),
  };
  assert.equal(await resolveProductCategory({ categoryId: CATEGORY_A, CategoryModel: fake }), CATEGORY_A);
  await assert.rejects(resolveProductCategory({ categoryId: CATEGORY_B, CategoryModel: fake }), { code: 'CATEGORY_INACTIVE' });
  await assert.rejects(resolveProductCategory({ categoryId: 'invalid', CategoryModel: fake }), { code: 'CATEGORY_INVALID' });
  assert.equal(await resolveProductCategory({ categoryId: CATEGORY_B, existingProduct: { categoryId: CATEGORY_B }, CategoryModel: fake }), CATEGORY_B);
  assert.equal(await resolveProductCategory({ categoryId: '', existingProduct: { categoryId: CATEGORY_B }, CategoryModel: fake }), CATEGORY_B);
});

test('owner category mutation routes include owner authorization and rely on shared CSRF middleware', () => {
  for (const [pathName, method] of [['/categories', 'get'], ['/categories', 'post'], ['/categories/:id', 'post'], ['/categories/:id/status', 'post']]) {
    const layer = adminRoutes.stack.find((entry) => entry.route?.path === pathName && entry.route.methods[method]);
    assert.ok(layer, `${method.toUpperCase()} ${pathName} is registered`);
    assert.equal(layer.route.stack[0].handle, requireOwner);
  }
  const passed = [];
  verifyCsrf({ method: 'POST', get: () => null, body: { _csrf: 'wrong' }, session: { csrfToken: 'expected' } }, {}, (error) => passed.push(error?.code));
  assert.deepEqual(passed, ['CSRF_INVALID']);
});

test('active category filtering excludes inactive references and keeps empty active categories navigable', async () => {
  assert.deepEqual(activeCategoryVisibilityFilter([CATEGORY_A]), {
    $or: [
      { categoryId: { $in: [CATEGORY_A] } },
      { categoryId: { $exists: false } },
      { categoryId: null },
    ],
  });
  assert.deepEqual(activeCategoryVisibilityFilter([]), {
    $or: [{ categoryId: { $exists: false } }, { categoryId: null }],
  });
  assert.deepEqual(categoryProductListing([CATEGORY_A], CATEGORY_A), { categoryId: CATEGORY_A });
  const active = [{ _id: CATEGORY_A, name: 'Festive sweets', slug: 'festive-sweets', isActive: true }];
  assert.equal(selectActiveCategory(active, 'inactive-slug'), null);
  assert.equal(selectActiveCategory(active, 'festive-sweets')._id, CATEGORY_A);

  const page = await ejs.renderFile(path.join(ROOT, 'customer/views/pages/products.ejs'), {
    pageTitle: 'Our sweets', assetPrefix: '/assets', account: { name: 'Customer' }, csrfToken: 'csrf',
    categories: [{ _id: CATEGORY_A, name: 'Festive sweets', slug: 'festive-sweets', isActive: true }],
    products: [], selectedCategory: 'festive-sweets', selectedCategoryName: 'Festive sweets', invalidCategory: false,
  });
  assert.match(page, /href="\/products\?category=festive-sweets"/);
  assert.match(page, /No sweets in Festive sweets yet/);
});

test('legacy category migration plans normalized aliases, reports unsafe data, and is idempotent', async () => {
  const products = [
    { _id: PRODUCT_A, category: '  Festive   Sweets ' },
    { _id: PRODUCT_B, category: 'festive sweets' },
    { _id: PRODUCT_C, category: '   ' },
  ];
  const plan = buildMigrationPlan(products, []);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.productAssignments.length, 2);
  assert.equal(plan.normalizedAliases.length, 1);
  assert.deepEqual(plan.missing, [{ productId: PRODUCT_C, valueType: 'string' }]);

  const colliding = buildMigrationPlan([
    { _id: PRODUCT_A, category: 'Tea & Sweets' },
    { _id: PRODUCT_B, category: 'Tea Sweets' },
  ], []);
  assert.equal(colliding.ambiguous.length, 1);

  const state = {
    products: [
      { _id: PRODUCT_A, category: 'Festive Sweets' },
      { _id: PRODUCT_B, category: 'festive sweets' },
    ],
    categories: [],
    nextId: 30,
  };
  const query = (fn) => ({ lean: async () => fn() });
  const ProductModel = {
    find: () => query(() => state.products.map((item) => ({ ...item }))),
    async updateOne(filter, update) {
      const product = state.products.find((item) => String(item._id) === String(filter._id) && !item.categoryId);
      if (!product) return { matchedCount: 0, modifiedCount: 0 };
      product.categoryId = update.$set.categoryId;
      return { matchedCount: 1, modifiedCount: 1 };
    },
  };
  const CategoryModel = {
    find: () => query(() => state.categories.map((item) => ({ ...item }))),
    findOneAndUpdate(filter, update) {
      let category = state.categories.find((item) => item.normalizedName === filter.normalizedName);
      if (!category) {
        category = { _id: `category-${state.nextId++}`, ...update.$setOnInsert };
        state.categories.push(category);
      }
      return query(() => category);
    },
  };
  const dryRun = await migrateLegacyProductCategories({ ProductModel, CategoryModel });
  assert.equal(dryRun.applied, false);
  assert.equal(state.categories.length, 0);
  const firstRun = await migrateLegacyProductCategories({ ProductModel, CategoryModel, apply: true });
  assert.equal(firstRun.applied, true);
  assert.equal(state.categories.length, 1);
  assert.equal(state.products[0].categoryId, state.products[1].categoryId);
  const secondRun = await migrateLegacyProductCategories({ ProductModel, CategoryModel, apply: true });
  assert.equal(secondRun.applied, true);
  assert.equal(secondRun.productsToReference, 0);
  assert.equal(state.categories.length, 1);
});

test('product form renders active category choices and explains preserved inactive associations', async () => {
  const html = await ejs.renderFile(path.join(ROOT, 'admin/views/pages/product-form.ejs'), {
    pageTitle: 'Edit product', assetPrefix: '/assets', account: { name: 'Owner' }, csrfToken: 'csrf',
    activePath: '/products', categories: [{ _id: CATEGORY_A, name: 'Festive sweets', slug: 'festive-sweets', isActive: true }],
    currentCategory: { _id: CATEGORY_B, name: 'Old category', isActive: false },
    product: { _id: PRODUCT_A, categoryId: CATEGORY_B, name: 'Kaju Katli', imageUrl: '' },
    values: { name: 'Kaju Katli', description: '', categoryId: CATEGORY_B, priceRupees: '', unitType: 'piece', weightAmount: '', weightUnit: 'g', quantityPerPiece: 1, prepMinutes: 0 },
    errors: [], error: '',
  });
  assert.match(html, new RegExp(`option value="${CATEGORY_A}"`));
  assert.match(html, new RegExp(`option value="${CATEGORY_B}" selected`));
  assert.match(html, /inactive — preserved unless replaced/);

  const empty = await ejs.renderFile(path.join(ROOT, 'admin/views/pages/product-form.ejs'), {
    pageTitle: 'Add product', assetPrefix: '/assets', account: { name: 'Owner' }, csrfToken: 'csrf',
    activePath: '/products', categories: [], currentCategory: null, product: null,
    values: { name: '', description: '', categoryId: '', priceRupees: '', unitType: 'piece', weightAmount: '', weightUnit: 'g', quantityPerPiece: 1, prepMinutes: 0 },
    errors: [], error: '',
  });
  assert.match(empty, /Add or activate a category/);
  assert.match(empty, /button-primary" type="submit" disabled/);
});
