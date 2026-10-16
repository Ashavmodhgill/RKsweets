const mongoose = require('mongoose');

async function connectDatabase(uri) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: process.env.NODE_ENV !== 'production',
  });
  return mongoose.connection;
}

module.exports = { connectDatabase };
