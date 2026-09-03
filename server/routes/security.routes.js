const express = require('express');
const { verifyChain } = require('../services/hash.service');
const router = express.Router();

router.get('/verify-chain', async (req, res) => {
  try {
    const result = await verifyChain(req.app.get('db'));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
module.exports = router;
