require('dotenv').config();
const express = require('express');

const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const WhatsAppService = require('../services/baileys');

// Session başlatma
router.post('/start', verifyToken, async (req, res) => {
  try {
    const qr = await WhatsAppService.initialize();

    if (qr) {
      res.sendResponse(200, {
        status: 'waiting_qr',
        qr,
      });
    } else {
      res.sendResponse(200, {
        status: 'connected',
        message: 'WhatsApp oturumu başarıyla başlatıldı',
      });
    }
  } catch (error) {
    res.sendError(500, error);
  }
});

// Session durumu ve QR kodu
router.get('/status', verifyToken, (req, res) => {
  try {
    const status = WhatsAppService.getConnectionStatus();
    res.sendResponse(200, status);
  } catch (error) {
    res.sendError(500, error);
  }
});

// Session sonlandırma
router.post('/logout', verifyToken, async (req, res) => {
  try {
    await WhatsAppService.logout();
    res.sendResponse(200, { message: 'WhatsApp oturumu sonlandırıldı' });
  } catch (error) {
    res.sendError(500, error);
  }
});

module.exports = router;
