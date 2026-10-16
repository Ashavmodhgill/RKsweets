const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const Product = require('../models/product.model');
const ProductCategory = require('../models/product-category.model');
const { connectDatabase } = require('../config/database');
const { migrateLegacyProductCategories } = require('../services/product-category-migration.service');

async function run() {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  if (typeof process.env.MONGODB_URI !== 'string' || !process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required for category migration.');
  }
  const apply = process.argv.includes('--apply');
  try {
    await connectDatabase(process.env.MONGODB_URI);
    const report = await migrateLegacyProductCategories({ ProductModel: Product, CategoryModel: ProductCategory, apply });
    console.info(JSON.stringify(report, null, 2));
    if (report.missing.length || report.ambiguous.length) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch(() => {
    console.error('Product category migration stopped safely. Review the selected database and migration report before retrying.');
    process.exitCode = 1;
  });
}

module.exports = { run };
