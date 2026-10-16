const express = require('express');
const router = express.Router();

router.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = router;
