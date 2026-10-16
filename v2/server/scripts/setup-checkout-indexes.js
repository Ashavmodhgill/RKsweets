const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DiningTable = require('../models/dining-table.model');
const Order = require('../models/order.model');
const OrderTokenCounter = require('../models/order-token-counter.model');
const { connectDatabase } = require('../config/database');

async function setupCheckoutIndexes(source = process.env) {
  if (typeof source.MONGODB_URI !== 'string' || source.MONGODB_URI.length === 0) {
    throw new Error('MONGODB_URI is required to create checkout indexes.');
  }

  try {
    await connectDatabase(source.MONGODB_URI);
    const counterExists = await mongoose.connection.db.listCollections({ name: 'order_token_counters' }).hasNext();
    if (!counterExists) await OrderTokenCounter.createCollection();
    await Promise.all([DiningTable.createIndexes(), Order.createIndexes()]);
    console.info('Checkout, dining table, and order token indexes created successfully.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  setupCheckoutIndexes().catch(() => {
    console.error('Checkout index setup failed. Check database availability and resolve duplicate table numbers or existing token conflicts before retrying.');
    process.exitCode = 1;
  });
}

module.exports = { setupCheckoutIndexes };
