const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const DiningTable = require('../models/dining-table.model');
const DiningVisit = require('../models/dining-visit.model');
const Order = require('../models/order.model');
const { connectDatabase } = require('../config/database');

async function setupDiningIndexes(source = process.env) {
  if (typeof source.MONGODB_URI !== 'string' || !source.MONGODB_URI) throw new Error('MONGODB_URI is required to create dining indexes.');
  try {
    await connectDatabase(source.MONGODB_URI);
    await Promise.all([DiningTable.createIndexes(), DiningVisit.createIndexes(), Order.createIndexes()]);
    console.info('Dining table, visit, and order indexes created successfully.');
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  setupDiningIndexes().catch(() => {
    console.error('Dining index setup failed. Confirm the intended database and resolve duplicate table numbers, active visits, or order indexes before retrying.');
    process.exitCode = 1;
  });
}

module.exports = { setupDiningIndexes };
