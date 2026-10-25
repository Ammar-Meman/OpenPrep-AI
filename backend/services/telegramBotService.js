/**
 * Telegram Study Bot Service
 * Manages communication with the Telegram Bot API:
 * - One-time account pairing link generation (/start auth_<token>)
 * - Formats and dispatches Daily Flashcard Review Digests with interactive inline buttons
 * - Dispatches Streak Protection Alerts when study streaks are at risk
 * - Webhook processing for bot commands (/start, /status, /review, /help) and callback actions
 */

const crypto = require('crypto');
const axios = require('axios');
const { User, Flashcard, FlashcardDeck } = require('../models');

class TelegramBotService {
  constructor(httpClient = axios) {
    this.http = httpClient;
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.botUsername = process.env.TELEGRAM_BOT_USERNAME || 'OpenPrepStudyBot';
    this.webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || 'openprep_telegram_webhook_secret';
    this.appBaseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://open-prep-ai.vercel.app';
  }

  getApiUrl(method) {
    return `https://api.telegram.org/bot${this.botToken}/${method}`;
  }

  isConfigured() {
    return Boolean(this.botToken && this.botToken.length > 5);
  }

  /**
   * Verify the X-Telegram-Bot-Api-Secret-Token webhook header
   */
  verifyWebhookSecret(headerSecret) {
    if (!this.webhookSecret) return true;
    return headerSecret === this.webhookSecret;
  }

  /**
   * Generic Telegram API dispatch helper
   */
  async callApi(method, payload) {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Telegram Bot Token not configured' };
    }

    try {
      const response = await this.http.post(this.getApiUrl(method), payload, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      });
      return response.data;
    } catch (err) {
      const errMsg = err.response?.data?.description || err.message;
      console.error(`Telegram API error in ${method}:`, errMsg);
      return { ok: false, error: errMsg };
    }
  }

  /**
   * Send a text message with Markdown formatting and optional inline keyboard
   */
  async sendMessage(chatId, text, options = {}) {
    const payload = {
      chat_id: chatId,
      text,
      parse_mode: options.parseMode || 'Markdown',
      disable_web_page_preview: options.disablePreview !== undefined ? options.disablePreview : true,
      reply_markup: options.replyMarkup || undefined,
    };

    return this.callApi('sendMessage', payload);
  }

  /**
   * Answer an incoming callback query from an inline keyboard button tap
   */
  async answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    return this.callApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  /**
   * Generate a secure one-time pairing token for account linking
   */
  async generatePairingToken(user) {
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes TTL

    user.telegramPairingToken = token;
    user.telegramPairingTokenExpires = expiresAt;
    await user.save();

    const pairingUrl = `https://t.me/${this.botUsername}?start=auth_${token}`;

    return {
      pairingToken: token,
      pairingUrl,
      expiresAt,
    };
  }

  /**
   * Verify candidate token received via `/start auth_<token>` and link user account
   */
  async verifyAndLinkTelegramAccount(token, chatId, username = '') {
    if (!token) return { success: false, message: 'Invalid token' };

    const cleanToken = token.startsWith('auth_') ? token.replace('auth_', '') : token;

    const user = await User.findOne({
      where: {
        telegramPairingToken: cleanToken,
      },
    });

    if (!user) {
      return { success: false, message: 'Invalid or unrecognized pairing link.' };
    }

    if (user.telegramPairingTokenExpires && new Date() > user.telegramPairingTokenExpires) {
      return { success: false, message: 'This pairing link has expired. Please generate a new one in OpenPrep settings.' };
    }

    // Link account
    user.telegramChatId = String(chatId);
    user.telegramUsername = username || null;
    user.telegramNotificationsEnabled = true;
    user.telegramPairingToken = null;
    user.telegramPairingTokenExpires = null;
    await user.save();

    const welcomeMsg = [
      `🎉 *OpenPrep AI Account Linked!*`,
      ``,
      `Hello *${user.name || 'Student'}*, your Telegram account has been linked to OpenPrep AI.`,
      ``,
      `You will now receive:`,
      `• 📚 *Daily Card Review Digest* at your configured morning hour`,
      `• 🔥 *Streak Protection Alerts* to prevent streak resets`,
      ``,
      `Type /status anytime to view your study progress, or /help for more commands.`,
    ].join('\n');

    await this.sendMessage(chatId, welcomeMsg, {
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '📖 Open Flashcards', url: `${this.appBaseUrl}/flashcards` },
            { text: '📊 Study Dashboard', url: `${this.appBaseUrl}/dashboard` },
          ],
        ],
      },
    });

    return { success: true, user };
  }

  /**
   * Unlink a user's Telegram integration
   */
  async unlinkTelegramAccount(user) {
    if (user.telegramChatId) {
      await this.sendMessage(
        user.telegramChatId,
        'ℹ️ *Telegram notifications disconnected.* Your OpenPrep AI account has been unlinked.'
      );
    }

    user.telegramChatId = null;
    user.telegramUsername = null;
    user.telegramNotificationsEnabled = false;
    user.telegramPairingToken = null;
    user.telegramPairingTokenExpires = null;
    await user.save();

    return { success: true };
  }

  /**
   * Formats a rich Markdown study summary digest
   */
  formatDailyDigest(user, digestData = {}) {
    const dueCount = digestData.dueCardsCount || 0;
    const streak = user.streakCount || 0;
    const freezes = user.streakFreezesAvailable !== undefined ? user.streakFreezesAvailable : (user.streakFreezes || 0);
    const topDecks = digestData.topDecks || [];
    const nextExam = digestData.nextExam || null;

    const lines = [
      `📚 *Daily Study Digest - OpenPrep AI*`,
      `🗓 _${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}_`,
      ``,
      `🔥 *Study Streak*: ${streak} Days ${streak > 0 ? '(Active)' : ''}`,
      `❄️ *Streak Freezes*: ${freezes} available`,
      ``,
      `📖 *Cards Due Today*: *${dueCount}* ${dueCount === 1 ? 'card' : 'cards'}`,
      `⏱ *Estimated Time*: ~${Math.ceil(dueCount * 0.7)} mins`,
    ];

    if (topDecks.length > 0) {
      lines.push(``, `🎯 *Priority Decks*:`);
      topDecks.slice(0, 3).forEach((d) => {
        lines.push(`• ${d.title || d.name} (${d.dueCount || d.count} cards)`);
      });
    }

    if (nextExam && nextExam.title) {
      lines.push(``, `🎯 *Next Exam Target*: ${nextExam.title} (${nextExam.countdown || 'upcoming'})`);
    }

    lines.push(``, `Ready to review today's cards and keep your streak alive?`);

    return lines.join('\n');
  }

  /**
   * Send daily study digest to a linked chat
   */
  async sendStudyDigest(chatId, user, digestData = {}) {
    const text = this.formatDailyDigest(user, digestData);

    const keyboard = [
      [
        {
          text: '📖 Review Due Cards Now',
          url: `${this.appBaseUrl}/flashcards`,
        },
      ],
      [
        {
          text: '❄️ Use Streak Freeze',
          callback_data: 'action:freeze_streak',
        },
        {
          text: '📊 View Dashboard',
          url: `${this.appBaseUrl}/dashboard`,
        },
      ],
    ];

    return this.sendMessage(chatId, text, {
      replyMarkup: { inline_keyboard: keyboard },
    });
  }

  /**
   * Format and send an urgent Streak Protection Alert
   */
  formatStreakProtectionAlert(user) {
    const streak = user.streakCount || 1;
    const freezes = user.streakFreezesAvailable !== undefined ? user.streakFreezesAvailable : (user.streakFreezes || 0);

    return [
      `🚨 *Streak Protection Alert!*`,
      ``,
      `Your *${streak}-Day Study Streak* will expire at midnight tonight!`,
      `You haven't completed any review sessions or study goals today.`,
      ``,
      `❄️ *Streak Freezes Remaining*: ${freezes}`,
      ``,
      `Complete a quick 5-card review now or activate a Streak Freeze to protect your hard-earned progress!`,
    ].join('\n');
  }

  async sendStreakProtectionAlert(chatId, user) {
    const text = this.formatStreakProtectionAlert(user);

    const keyboard = [
      [
        {
          text: '⚡ Quick 5-Card Review',
          url: `${this.appBaseUrl}/flashcards?quick=true`,
        },
      ],
      [
        {
          text: '❄️ Activate Streak Freeze',
          callback_data: 'action:freeze_streak',
        },
      ],
    ];

    return this.sendMessage(chatId, text, {
      replyMarkup: { inline_keyboard: keyboard },
    });
  }

  /**
   * Process Telegram incoming updates (webhook)
   */
  async handleWebhookUpdate(update) {
    if (!update) return { handled: false };

    // 1. Handle Inline Button Callback Queries
    if (update.callback_query) {
      return this.handleCallbackQuery(update.callback_query);
    }

    // 2. Handle Text Messages and Commands
    if (update.message && update.message.text) {
      return this.handleMessage(update.message);
    }

    return { handled: false };
  }

  /**
   * Handle text messages and slash commands
   */
  async handleMessage(message) {
    const chatId = message.chat.id;
    const text = (message.text || '').trim();
    const username = message.from?.username || message.from?.first_name || '';

    // Handle /start auth_<token> (Account linking)
    if (text.startsWith('/start auth_')) {
      const token = text.replace('/start auth_', '').trim();
      return this.verifyAndLinkTelegramAccount(token, chatId, username);
    }

    // Handle generic /start
    if (text === '/start') {
      const user = await User.findOne({ where: { telegramChatId: String(chatId) } });
      if (user) {
        return this.sendMessage(
          chatId,
          `👋 Welcome back, *${user.name}*!\n\nYour account is linked. Type /status to check your streak or /review to study.`
        );
      }

      return this.sendMessage(
        chatId,
        [
          `👋 *Welcome to OpenPrep AI Study Bot!*`,
          ``,
          `To link your OpenPrep account and receive daily revision digests & streak alerts:`,
          `1. Open [OpenPrep AI Settings](${this.appBaseUrl}/settings)`,
          `2. Click *"Link Telegram Account"*`,
          `3. Open the personalized pairing link provided`,
          ``,
          `Commands available:`,
          `• /status - Check your study streak and due cards`,
          `• /review - Quick link to review due flashcards`,
          `• /help - Display instructions and commands`,
        ].join('\n')
      );
    }

    // Handle /status
    if (text === '/status') {
      const user = await User.findOne({ where: { telegramChatId: String(chatId) } });
      if (!user) {
        return this.sendMessage(
          chatId,
          `⚠️ Your Telegram account is not yet linked to OpenPrep AI. Please link it from your [Settings](${this.appBaseUrl}/settings).`
        );
      }

      const streak = user.streakCount || 0;
      const freezes = user.streakFreezesAvailable !== undefined ? user.streakFreezesAvailable : (user.streakFreezes || 0);

      return this.sendMessage(
        chatId,
        [
          `📊 *Your OpenPrep Study Status*`,
          ``,
          `👤 *User*: ${user.name}`,
          `🔥 *Current Streak*: ${streak} Days`,
          `❄️ *Streak Freezes*: ${freezes} available`,
          `⭐ *PrepCoins*: ${user.prepCoins || 0}`,
          `📈 *XP Level*: Level ${user.level || 1} (${user.xp || 0} XP)`,
          ``,
          `Ready for today's review?`,
        ].join('\n'),
        {
          replyMarkup: {
            inline_keyboard: [
              [{ text: '📖 Review Cards Now', url: `${this.appBaseUrl}/flashcards` }],
            ],
          },
        }
      );
    }

    // Handle /review
    if (text === '/review') {
      return this.sendMessage(
        chatId,
        `🚀 Click below to launch your OpenPrep card review session:`,
        {
          replyMarkup: {
            inline_keyboard: [
              [{ text: '📖 Start Review Session', url: `${this.appBaseUrl}/flashcards` }],
            ],
          },
        }
      );
    }

    // Handle /help
    if (text === '/help') {
      return this.sendMessage(
        chatId,
        [
          `🤖 *OpenPrep Telegram Bot Commands*:`,
          ``,
          `• /status - View current streak, XP, and review status`,
          `• /review - Quick launch link for flashcard reviews`,
          `• /help - Show this guide`,
          ``,
          `Need to change notifications? Manage them anytime in your [OpenPrep Settings](${this.appBaseUrl}/settings).`,
        ].join('\n')
      );
    }

    // Default response
    return this.sendMessage(
      chatId,
      `I didn't recognize that command. Type /help to see what I can do!`
    );
  }

  /**
   * Handle inline button callback queries
   */
  async handleCallbackQuery(callbackQuery) {
    const callbackId = callbackQuery.id;
    const data = callbackQuery.data;
    const chatId = callbackQuery.message?.chat?.id;

    if (data === 'action:freeze_streak') {
      const user = await User.findOne({ where: { telegramChatId: String(chatId) } });
      if (!user) {
        return this.answerCallbackQuery(callbackId, 'Account not found. Please link your account first.', true);
      }

      const availableFreezes = user.streakFreezesAvailable !== undefined ? user.streakFreezesAvailable : (user.streakFreezes || 0);

      if (availableFreezes <= 0) {
        return this.answerCallbackQuery(
          callbackId,
          '❌ No Streak Freezes available! Complete reviews or visit the Rewards Shop to get more.',
          true
        );
      }

      // Deduct one freeze
      if (user.streakFreezesAvailable !== undefined && user.streakFreezesAvailable > 0) {
        user.streakFreezesAvailable -= 1;
      } else if (user.streakFreezes > 0) {
        user.streakFreezes -= 1;
      }
      await user.save();

      await this.answerCallbackQuery(callbackId, '❄️ Streak Freeze successfully activated for today!', false);

      return this.sendMessage(
        chatId,
        `❄️ *Streak Freeze Activated!* Your study streak is safely protected for today.`
      );
    }

    return this.answerCallbackQuery(callbackId);
  }
}

module.exports = new TelegramBotService();
