const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const connection = mongoose.connection;
    if (connection.readyState !== 1 || !connection.db) {
      return res.status(503).json({ status: 'not_ready' });
    }
    await connection.db.admin().ping();
    return res.status(200).json({ status: 'ready' });
  } catch (_error) {
    return res.status(503).json({ status: 'not_ready' });
  }
});

module.exports = router;
