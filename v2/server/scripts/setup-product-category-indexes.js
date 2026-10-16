const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Product = require('../models/product.model');
const ProductCategory = require('../models/product-category.model');
const { connectDatabase } = require('../config/database');

async function setupProductCategoryIndexes(source = process.env) {
  if (typeof source.MONGODB_URI !== 'string' || !source.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to create product category indexes.');
  }
  try {
    await connectDatabase(source.MONGODB_URI);
    await Promise.all([ProductCategory.createIndexes(), Product.createIndexes()]);
    console.info('Product category and reference indexes created successfully.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  setupProductCategoryIndexes().catch(() => {
    console.error('Product category index setup failed. Verify the selected database and resolve duplicate category names/slugs or product slug conflicts before retrying.');
    process.exitCode = 1;
  });
}

module.exports = { setupProductCategoryIndexes };
