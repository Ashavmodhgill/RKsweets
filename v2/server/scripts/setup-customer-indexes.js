const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const Customer = require('../models/customer.model');
const { connectDatabase } = require('../config/database');

async function setupCustomerIndexes(source = process.env) {
  if (typeof source.MONGODB_URI !== 'string' || source.MONGODB_URI.length === 0) {
    throw new Error('MONGODB_URI is required to create customer indexes.');
  }

  try {
    await connectDatabase(source.MONGODB_URI);
    await Customer.createIndexes();
    console.info('Customer indexes created successfully.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  setupCustomerIndexes().catch(() => {
    console.error('Customer index setup failed. Check for duplicate mobile numbers and database availability.');
    process.exitCode = 1;
  });
}

module.exports = { setupCustomerIndexes };
