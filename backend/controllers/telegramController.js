/**
 * Telegram Controller
 * Handles user endpoints for Telegram pairing, notification preferences,
 * webhook callbacks from Telegram Bot API, and test digest triggers.
 */

const telegramBotService = require('../services/telegramBotService');
const { Flashcard, FlashcardDeck } = require('../models');

/**
 * @desc Get current Telegram integration status
 * @route GET /api/telegram/status
 * @access Private
 */
exports.getTelegramStatus = async (req, res) => {
  try {
    const user = req.user;

    res.json({
      success: true,
      isConfigured: telegramBotService.isConfigured(),
      botUsername: telegramBotService.botUsername,
      isLinked: Boolean(user.telegramChatId),
      telegramUsername: user.telegramUsername || null,
      notificationsEnabled: Boolean(user.telegramNotificationsEnabled),
      dailyDigestHour: user.telegramDailyDigestHour || 8,
    });
  } catch (err) {
    console.error('Error fetching telegram status:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc Generate one-time pairing link for account linking
 * @route POST /api/telegram/pair-token
 * @access Private
 */
exports.generatePairingLink = async (req, res) => {
  try {
    const user = req.user;
    const pairingInfo = await telegramBotService.generatePairingToken(user);

    res.json({
      success: true,
      ...pairingInfo,
    });
  } catch (err) {
    console.error('Error generating telegram pairing token:', err);
    res.status(500).json({ success: false, message: 'Server error generating pairing token' });
  }
};

/**
 * @desc Unlink Telegram account
 * @route DELETE /api/telegram/unlink
 * @access Private
 */
exports.unlinkTelegram = async (req, res) => {
  try {
    const user = req.user;
    await telegramBotService.unlinkTelegramAccount(user);

    res.json({
      success: true,
      message: 'Telegram account unlinked successfully',
    });
  } catch (err) {
    console.error('Error unlinking telegram account:', err);
    res.status(500).json({ success: false, message: 'Server error unlinking account' });
  }
};

/**
 * @desc Update Telegram notification preferences
 * @route PATCH /api/telegram/settings
 * @access Private
 */
exports.updateTelegramSettings = async (req, res) => {
  try {
    const user = req.user;
    const { notificationsEnabled, dailyDigestHour } = req.body;

    if (typeof notificationsEnabled === 'boolean') {
      user.telegramNotificationsEnabled = notificationsEnabled;
    }

    if (dailyDigestHour !== undefined) {
      const hour = parseInt(dailyDigestHour, 10);
      if (isNaN(hour) || hour < 0 || hour > 23) {
        return res.status(400).json({
          success: false,
          message: 'dailyDigestHour must be an integer between 0 and 23',
        });
      }
      user.telegramDailyDigestHour = hour;
    }

    await user.save();

    res.json({
      success: true,
      notificationsEnabled: user.telegramNotificationsEnabled,
      dailyDigestHour: user.telegramDailyDigestHour,
    });
  } catch (err) {
    console.error('Error updating telegram settings:', err);
    res.status(500).json({ success: false, message: 'Server error updating settings' });
  }
};

/**
 * @desc Send test daily digest to user's linked Telegram chat
 * @route POST /api/telegram/test-digest
 * @access Private
 */
exports.sendTestDigest = async (req, res) => {
  try {
    const user = req.user;

    if (!user.telegramChatId) {
      return res.status(400).json({
        success: false,
        message: 'Telegram account is not linked. Please link your account first.',
      });
    }

    // Compute due cards count for user
    let dueCardsCount = 5;
    try {
      if (Flashcard) {
        dueCardsCount = await Flashcard.count({ where: { userId: user.id } });
      }
    } catch {
      // Fallback
    }

    const digestData = {
      dueCardsCount: dueCardsCount || 8,
      topDecks: [
        { title: 'High-Yield Core Deck', dueCount: 5 },
        { title: 'Revision Checklist', dueCount: 3 },
      ],
      nextExam: {
        title: 'Midterm Comprehensive Mock',
        countdown: 'in 5 days',
      },
    };

    const sendResult = await telegramBotService.sendStudyDigest(
      user.telegramChatId,
      user,
      digestData
    );

    if (sendResult.ok === false) {
      return res.status(502).json({
        success: false,
        message: sendResult.error || 'Failed to dispatch Telegram message',
      });
    }

    res.json({
      success: true,
      message: 'Test study digest sent successfully to Telegram!',
    });
  } catch (err) {
    console.error('Error sending test digest:', err);
    res.status(500).json({ success: false, message: 'Server error sending test digest' });
  }
};

/**
 * @desc Public Webhook endpoint called by Telegram servers
 * @route POST /api/telegram/webhook
 * @access Public (Secret header validated)
 */
exports.handleWebhook = async (req, res) => {
  try {
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];

    if (!telegramBotService.verifyWebhookSecret(secretHeader)) {
      return res.status(401).json({ success: false, message: 'Unauthorized webhook secret' });
    }

    await telegramBotService.handleWebhookUpdate(req.body);

    // Telegram requires 200 OK response immediately
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error handling Telegram webhook:', err);
    res.status(200).json({ ok: true }); // Acknowledge to prevent Telegram infinite retries
  }
};
