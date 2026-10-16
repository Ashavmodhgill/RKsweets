const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const { readEnv } = require('./config/env');
const { connectDatabase } = require('./config/database');
const { startPortal } = require('./start-portal');

startPortal('customer').catch((error) => {
  console.error(`Customer server startup failed: ${error.name || 'Error'}. Check configuration and database availability.`);
  process.exitCode = 1;
});
