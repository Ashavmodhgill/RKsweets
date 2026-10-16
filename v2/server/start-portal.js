const path = require('node:path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { readEnv } = require('./config/env');
const { connectDatabase } = require('./config/database');
const { createApp } = require('./app');

dotenv.config({ path: path.join(__dirname, '.env') });

async function startPortal(portal) {
  const env = readEnv();
  const port = portal === 'admin' ? env.ADMIN_PORT : env.PORT;
  await connectDatabase(env.MONGODB_URI);
  const app = createApp(env, portal);
  const server = app.listen(port, () => {
    console.info(`RK Sweets V2 ${portal} portal listening on port ${port}`);
  });

  const shutdown = (signal) => {
    console.info(`${signal} received; closing ${portal} portal.`);
    server.close(async (error) => {
      if (error) {
        console.error(`Server shutdown failed: ${error.message}`);
        process.exitCode = 1;
      }
      await mongoose.disconnect();
      process.exit();
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = { startPortal };
