const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { readOwnerSetupEnv } = require('../config/owner-setup');
const { connectDatabase } = require('../config/database');
const Account = require('../models/account.model');
const { createOwnerAccount } = require('../services/account-auth.service');

async function runOwnerSetup(source = process.env) {
  const config = readOwnerSetupEnv(source);
  try {
    await connectDatabase(config.MONGODB_URI);
    // Production autoIndex is disabled; this explicit setup command installs declared auth indexes.
    await Account.createIndexes();
    await createOwnerAccount({
      name: config.OWNER_SETUP_NAME,
      mobile: config.OWNER_SETUP_MOBILE,
      password: config.OWNER_SETUP_PASSWORD,
    });
    console.info('Owner account created successfully.');
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  runOwnerSetup().catch((error) => {
    if (error.code === 'OWNER_EXISTS') {
      console.error('Owner setup refused: an owner account already exists; no password was changed.');
    } else if (error.code === 'OWNER_MOBILE_IN_USE') {
      console.error('Owner setup refused: the configured mobile number is already assigned.');
    } else if (error.message?.startsWith('Invalid owner setup configuration.')) {
      console.error(error.message);
    } else {
      console.error('Owner setup failed. Check the configured database and try again.');
    }
    process.exitCode = 1;
  });
}

module.exports = { runOwnerSetup };
