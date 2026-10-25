const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const telegramController = require('../controllers/telegramController');

// Public Webhook receiver for Telegram Bot API
router.post('/webhook', telegramController.handleWebhook);

// Protected routes for authenticated users
router.get('/status', protect, telegramController.getTelegramStatus);
router.post('/pair-token', protect, telegramController.generatePairingLink);
router.delete('/unlink', protect, telegramController.unlinkTelegram);
router.patch('/settings', protect, telegramController.updateTelegramSettings);
router.post('/test-digest', protect, telegramController.sendTestDigest);

module.exports = router;
