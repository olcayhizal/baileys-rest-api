require('dotenv').config();
const express = require('express');

const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');

router.post('/session', verifyToken, async (req, res) => {
  try {
    const token = req.headers['x-access-token'];
    res.sendResponse(200, { token });
  } catch (error) {
    res.sendError(500, error);
  }
});

module.exports = router;
