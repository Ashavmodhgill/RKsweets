const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Product = require('../models/product.model');
const ProductCategory = require('../models/product-category.model').ProductCategory;
const { uploadProductImage, deleteProductImage } = require('../services/cloudinary-image.service');
const { resolveProductCategory } = require('../services/product-category.service');
const { productFields } = require('../validators/product.validator');

const fieldsForForm = (product = {}) => ({
  name: product.name || '', description: product.description || '',
  categoryId: product.categoryId?._id ? String(product.categoryId._id) : (product.categoryId ? String(product.categoryId) : ''),
  priceRupees: Number.isInteger(product.pricePaise) ? (product.pricePaise / 100).toFixed(2) : '',
  unitType: product.unitType || 'piece', weightAmount: product.weightAmount || '',
  weightUnit: product.weightUnit || 'g', quantityPerPiece: product.quantityPerPiece || 1,
  prepMinutes: product.prepMinutes ?? 0,
});

function messageFor(error) {
  if (error?.code === 11000) return 'A product with that name already exists.';
  if (error?.name === 'ValidationError') return 'Review the product details and try again.';
  return 'The request could not be completed. Please try again.';
}

function renderForm(res, { product, values, errors = [], error, status = 200, account, categories = [], currentCategory = null }) {
  return res.status(status).render('admin/views/pages/product-form', {
    pageTitle: product ? 'Edit product' : 'Add product', product, account,
    values: values || fieldsForForm(product), errors, error, categories, currentCategory,
  });
}

async function categoryFormState(product) {
  const [categories, currentCategory] = await Promise.all([
    ProductCategory.find({ isActive: true }).sort({ name: 1 }).lean(),
    product?.categoryId
      ? ProductCategory.findById(product.categoryId._id || product.categoryId).lean()
      : null,
  ]);
  return { categories, currentCategory };
}

function slugBase(name) {
  return name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'sweet';
}

async function uniqueSlug(name, currentId) {
  const base = slugBase(name);
  let slug = base;
  let suffix = 2;
  while (await Product.exists({ slug, ...(currentId ? { _id: { $ne: currentId } } : {}) })) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

function stagedUploads(req) {
  if (!req.session.stagedProductImages || typeof req.session.stagedProductImages !== 'object') {
    req.session.stagedProductImages = {};
  }
  return req.session.stagedProductImages;
}

function cloudinaryEnvironment() {
  return {
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',
  };
}

function getStaged(req, uploadId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) return null;
  const staged = stagedUploads(req)[uploadId];
  if (!staged || Date.now() - staged.createdAt > 60 * 60 * 1000) {
    delete stagedUploads(req)[uploadId];
    return null;
  }
  return staged;
}

function uploadImage(req, res, next) {
  const dataUrl = req.validated?.body?.dataUrl;
  uploadProductImage(dataUrl, cloudinaryEnvironment()).then((image) => {
    const uploadId = crypto.randomUUID();
    stagedUploads(req)[uploadId] = { ...image, createdAt: Date.now() };
    req.session.save((error) => {
      if (error) return next(error);
      return res.status(201).json({ uploadId });
    });
  }).catch(next);
}

async function list(req, res, next) {
  try {
    const products = await Product.find().populate('categoryId', 'name slug isActive').sort({ updatedAt: -1, name: 1 }).lean();
    const notices = {
      created: 'Product added.', updated: 'Product updated.', deleted: 'Product deleted.',
      activated: 'Product is now available.', deactivated: 'Product is now unavailable.',
      'not-found': 'That product could not be found.', invalid: 'Availability update was invalid.',
    };
    return res.render('admin/views/pages/products', {
      pageTitle: 'Products', account: req.authAccount, products, notice: notices[req.query.notice] || '',
    });
  } catch (error) { return next(error); }
}

async function newForm(req, res, next) {
  try {
    const state = await categoryFormState(null);
    return renderForm(res, { ...state, account: req.authAccount });
  } catch (error) { return next(error); }
}

async function create(req, res, next) {
  const values = req.body || {};
  try {
    const state = await categoryFormState(null);
    if (!state.categories.length) return renderForm(res, {
      ...state, values, error: 'Add and activate a product category before creating a product.',
      status: 409, account: req.authAccount,
    });
    const parsed = productFields.safeParse(values);
    if (!parsed.success) return renderForm(res, {
      ...state, values, errors: parsed.error.issues.map((issue) => ({ path: issue.path[0], message: issue.message })),
      status: 400, account: req.authAccount,
    });
    const { name, categoryId, ...allowed } = parsed.data;
    const validatedCategoryId = await resolveProductCategory({ categoryId });
    const uploadId = typeof values.imageUploadId === 'string' ? values.imageUploadId : '';
    const staged = uploadId ? getStaged(req, uploadId) : null;
    if (uploadId && !staged) return renderForm(res, { ...state, values, error: 'The uploaded image has expired. Please choose it again.', status: 400, account: req.authAccount });
    const product = new Product({
      name, ...allowed, categoryId: validatedCategoryId, slug: await uniqueSlug(name),
      ...(staged ? { imageUrl: staged.imageUrl, imagePublicId: staged.imagePublicId } : {}),
    });
    await product.save();
    if (staged) {
      delete stagedUploads(req)[uploadId];
      await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    }
    return res.redirect('/products?notice=created');
  } catch (error) {
    const state = await categoryFormState(null).catch(() => ({ categories: [], currentCategory: null }));
    return renderForm(res, { ...state, values, error: typeof error.code === 'string' && error.code.startsWith('CATEGORY_') ? error.message : messageFor(error), status: ['CATEGORY_DUPLICATE', 'CATEGORY_INACTIVE'].includes(error.code) || error?.code === 11000 ? 409 : 400, account: req.authAccount });
  }
}

async function loadForEdit(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('server/views/shared/error', {
    pageTitle: 'Product not found', statusCode: 404, message: 'That product could not be found.', details: [], portalPath: '/',
  });
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).render('server/views/shared/error', {
      pageTitle: 'Product not found', statusCode: 404, message: 'That product could not be found.', details: [], portalPath: '/',
    });
    const state = await categoryFormState(product);
    return renderForm(res, { ...state, product, account: req.authAccount });
  } catch (error) { return next(error); }
}

async function update(req, res, next) {
  const values = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).render('server/views/shared/error', {
    pageTitle: 'Product not found', statusCode: 404, message: 'That product could not be found.', details: [], portalPath: '/',
  });
  let existingProduct;
  let state;
  try {
    existingProduct = await Product.findById(req.params.id).lean();
    state = await categoryFormState(existingProduct);
  } catch (error) { return next(error); }
  if (!existingProduct) return res.status(404).render('server/views/shared/error', {
    pageTitle: 'Product not found', statusCode: 404, message: 'That product could not be found.', details: [], portalPath: '/',
  });
  const parsed = productFields.safeParse(values);
  if (!parsed.success) return renderForm(res, {
    ...state, values, errors: parsed.error.issues.map((issue) => ({ path: issue.path[0], message: issue.message })), status: 400,
    product: existingProduct, account: req.authAccount,
  });
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).render('server/views/shared/error', {
      pageTitle: 'Product not found', statusCode: 404, message: 'That product could not be found.', details: [], portalPath: '/',
    });
    const { name, categoryId, ...allowed } = parsed.data;
    const resolvedCategoryId = await resolveProductCategory({ categoryId, existingProduct });
    const uploadId = typeof values.imageUploadId === 'string' ? values.imageUploadId : '';
    const staged = uploadId ? getStaged(req, uploadId) : null;
    if (uploadId && !staged) return renderForm(res, {
      ...state, product, values, error: 'The uploaded image has expired. Please choose it again.', status: 400, account: req.authAccount,
    });
    const oldPublicId = product.imagePublicId;
    Object.assign(product, allowed, { name, slug: await uniqueSlug(name, product._id) });
    if (resolvedCategoryId) product.categoryId = resolvedCategoryId;
    if (staged) Object.assign(product, { imageUrl: staged.imageUrl, imagePublicId: staged.imagePublicId });
    await product.save();
    if (staged) {
      delete stagedUploads(req)[uploadId];
      await new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
      if (oldPublicId && oldPublicId !== staged.imagePublicId) {
        deleteProductImage(oldPublicId, cloudinaryEnvironment()).catch(() => {
          console.error('Old product image cleanup failed after product update.');
        });
      }
    }
    return res.redirect('/products?notice=updated');
  } catch (error) {
    const product = await Product.findById(req.params.id).lean().catch(() => existingProduct);
    return renderForm(res, { ...state, product, values, error: typeof error.code === 'string' && error.code.startsWith('CATEGORY_') ? error.message : messageFor(error), status: ['CATEGORY_DUPLICATE', 'CATEGORY_INACTIVE'].includes(error.code) || error?.code === 11000 ? 409 : 400, account: req.authAccount });
  }
}

async function setAvailability(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).redirect('/products?notice=not-found');
  const isAvailable = req.body?.isAvailable === 'true';
  if (!['true', 'false'].includes(req.body?.isAvailable)) return res.status(400).redirect('/products?notice=invalid');
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, { $set: { isAvailable } }, { runValidators: true });
    return res.redirect(`/products?notice=${product ? (isAvailable ? 'activated' : 'deactivated') : 'not-found'}`);
  } catch (error) { return next(error); }
}

async function remove(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).redirect('/products?notice=not-found');
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).redirect('/products?notice=not-found');
    if (product.imagePublicId) {
      deleteProductImage(product.imagePublicId, cloudinaryEnvironment()).catch(() => {
        console.error('Product image cleanup failed after product deletion.');
      });
    }
    return res.redirect('/products?notice=deleted');
  } catch (error) { return next(error); }
}

module.exports = { list, newForm, create, loadForEdit, update, uploadImage, setAvailability, remove };
