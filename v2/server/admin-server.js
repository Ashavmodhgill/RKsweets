const { startPortal } = require('./start-portal');

startPortal('admin').catch((error) => {
  console.error(`Admin server startup failed: ${error.name || 'Error'}. Check configuration and database availability.`);
  process.exitCode = 1;
});
