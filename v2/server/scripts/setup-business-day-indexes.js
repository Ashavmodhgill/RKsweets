const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { readEnv } = require('../config/env');
const BusinessDay = require('../models/business-day.model');
const Order = require('../models/order.model');

async function setup() {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  const env = readEnv();
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  await BusinessDay.createIndexes();
  await Order.createIndexes();
}

if (require.main === module) {
  setup().then(() => {
    console.info('Business-day and order indexes are ready.');
    return mongoose.disconnect();
  }).catch(async (error) => {
    console.error('Business-day index setup failed:', error.name || 'Error');
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { setup };
