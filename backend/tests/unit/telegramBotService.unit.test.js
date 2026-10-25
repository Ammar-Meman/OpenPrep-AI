import { describe, it, expect, beforeEach, vi } from 'vitest';
import telegramBotService from '../../services/telegramBotService';
import { User } from '../../models';

describe('telegramBotService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    telegramBotService.botToken = 'mock_telegram_bot_token_12345';
    telegramBotService.botUsername = 'OpenPrepStudyBot';
    telegramBotService.webhookSecret = 'test_webhook_secret';
    telegramBotService.http = {
      post: vi.fn().mockResolvedValue({ data: { ok: true, result: { message_id: 101 } } }),
    };
  });

  describe('configuration & webhook secret', () => {
    it('reports isConfigured when botToken is present', () => {
      expect(telegramBotService.isConfigured()).toBe(true);
      telegramBotService.botToken = '';
      expect(telegramBotService.isConfigured()).toBe(false);
    });

    it('verifies valid and rejects invalid webhook secrets', () => {
      expect(telegramBotService.verifyWebhookSecret('test_webhook_secret')).toBe(true);
      expect(telegramBotService.verifyWebhookSecret('wrong_secret')).toBe(false);
    });
  });

  describe('pairing token generation & verification', () => {
    it('generates a one-time pairing token and deep link', async () => {
      const mockUser = {
        id: 'user-123',
        telegramPairingToken: null,
        telegramPairingTokenExpires: null,
        save: vi.fn().mockResolvedValue(true),
      };

      const result = await telegramBotService.generatePairingToken(mockUser);

      expect(result.pairingToken).toBeDefined();
      expect(result.pairingToken.length).toBe(32);
      expect(result.pairingUrl).toContain('https://t.me/OpenPrepStudyBot?start=auth_');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.telegramPairingToken).toBe(result.pairingToken);
      expect(mockUser.telegramPairingTokenExpires.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects invalid or missing pairing tokens', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue(null);

      const result = await telegramBotService.verifyAndLinkTelegramAccount('invalid_token', 'chat-999');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid or unrecognized');
    });

    it('rejects expired pairing tokens', async () => {
      const expiredUser = {
        telegramPairingToken: 'expired_tok',
        telegramPairingTokenExpires: new Date(Date.now() - 5000), // in the past
      };
      vi.spyOn(User, 'findOne').mockResolvedValue(expiredUser);

      const result = await telegramBotService.verifyAndLinkTelegramAccount('expired_tok', 'chat-999');
      expect(result.success).toBe(false);
      expect(result.message).toContain('expired');
    });

    it('successfully links Telegram account and dispatches welcome message', async () => {
      const validUser = {
        id: 'user-1',
        name: 'Ammar',
        telegramPairingToken: 'valid_tok',
        telegramPairingTokenExpires: new Date(Date.now() + 60000),
        telegramChatId: null,
        telegramUsername: null,
        telegramNotificationsEnabled: false,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(User, 'findOne').mockResolvedValue(validUser);

      const result = await telegramBotService.verifyAndLinkTelegramAccount('auth_valid_tok', 'chat-999', 'ammar_dev');

      expect(result.success).toBe(true);
      expect(validUser.telegramChatId).toBe('chat-999');
      expect(validUser.telegramUsername).toBe('ammar_dev');
      expect(validUser.telegramNotificationsEnabled).toBe(true);
      expect(validUser.telegramPairingToken).toBeNull();
      expect(validUser.save).toHaveBeenCalled();
      expect(telegramBotService.http.post).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          chat_id: 'chat-999',
          text: expect.stringContaining('🎉 *OpenPrep AI Account Linked!*'),
        }),
        expect.any(Object)
      );
    });

    it('unlinks Telegram account and resets notifications', async () => {
      const linkedUser = {
        telegramChatId: 'chat-999',
        telegramUsername: 'ammar_dev',
        telegramNotificationsEnabled: true,
        save: vi.fn().mockResolvedValue(true),
      };

      const result = await telegramBotService.unlinkTelegramAccount(linkedUser);

      expect(result.success).toBe(true);
      expect(linkedUser.telegramChatId).toBeNull();
      expect(linkedUser.telegramNotificationsEnabled).toBe(false);
      expect(linkedUser.save).toHaveBeenCalled();
    });
  });

  describe('study digest formatting & dispatch', () => {
    it('formats Markdown study summary with emojis, streak, cards due, and top decks', () => {
      const mockUser = {
        name: 'Ammar',
        streakCount: 7,
        streakFreezesAvailable: 2,
      };

      const digestData = {
        dueCardsCount: 15,
        topDecks: [
          { title: 'Organic Chemistry', dueCount: 10 },
          { title: 'Physiology', dueCount: 5 },
        ],
        nextExam: { title: 'Midterm Mock', countdown: 'in 3 days' },
      };

      const text = telegramBotService.formatDailyDigest(mockUser, digestData);

      expect(text).toContain('📚 *Daily Study Digest - OpenPrep AI*');
      expect(text).toContain('🔥 *Study Streak*: 7 Days (Active)');
      expect(text).toContain('❄️ *Streak Freezes*: 2 available');
      expect(text).toContain('📖 *Cards Due Today*: *15* cards');
      expect(text).toContain('• Organic Chemistry (10 cards)');
      expect(text).toContain('🎯 *Next Exam Target*: Midterm Mock (in 3 days)');
    });

    it('dispatches daily study digest with interactive inline buttons', async () => {
      const mockUser = { streakCount: 5, streakFreezesAvailable: 1 };
      await telegramBotService.sendStudyDigest('chat-123', mockUser, { dueCardsCount: 8 });

      expect(telegramBotService.http.post).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          chat_id: 'chat-123',
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: '📖 Review Due Cards Now' }),
              ]),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('streak protection alert', () => {
    it('formats urgent streak protection warning message', () => {
      const mockUser = { streakCount: 12, streakFreezesAvailable: 1 };
      const text = telegramBotService.formatStreakProtectionAlert(mockUser);

      expect(text).toContain('🚨 *Streak Protection Alert!*');
      expect(text).toContain('Your *12-Day Study Streak* will expire at midnight tonight!');
      expect(text).toContain('❄️ *Streak Freezes Remaining*: 1');
    });

    it('dispatches streak protection alert with quick review and freeze buttons', async () => {
      const mockUser = { streakCount: 12, streakFreezesAvailable: 1 };
      await telegramBotService.sendStreakProtectionAlert('chat-123', mockUser);

      expect(telegramBotService.http.post).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          chat_id: 'chat-123',
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ text: '⚡ Quick 5-Card Review' }),
              ]),
              expect.arrayContaining([
                expect.objectContaining({ text: '❄️ Activate Streak Freeze', callback_data: 'action:freeze_streak' }),
              ]),
            ]),
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe('webhook update dispatching', () => {
    it('handles /status command and returns study metrics', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValue({
        name: 'Ammar',
        streakCount: 10,
        streakFreezesAvailable: 2,
        prepCoins: 150,
        level: 3,
        xp: 450,
      });

      const update = {
        message: {
          chat: { id: 12345 },
          text: '/status',
          from: { username: 'ammar_dev' },
        },
      };

      await telegramBotService.handleWebhookUpdate(update);

      expect(telegramBotService.http.post).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          chat_id: 12345,
          text: expect.stringContaining('🔥 *Current Streak*: 10 Days'),
        }),
        expect.any(Object)
      );
    });

    it('handles callback query to activate streak freeze', async () => {
      const mockUser = {
        telegramChatId: '12345',
        streakFreezesAvailable: 2,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(User, 'findOne').mockResolvedValue(mockUser);

      const update = {
        callback_query: {
          id: 'cb-101',
          data: 'action:freeze_streak',
          message: { chat: { id: 12345 } },
        },
      };

      await telegramBotService.handleWebhookUpdate(update);

      expect(mockUser.streakFreezesAvailable).toBe(1);
      expect(mockUser.save).toHaveBeenCalled();
      expect(telegramBotService.http.post).toHaveBeenCalledWith(
        expect.stringContaining('/answerCallbackQuery'),
        expect.objectContaining({
          callback_query_id: 'cb-101',
          text: expect.stringContaining('Streak Freeze successfully activated'),
        }),
        expect.any(Object)
      );
    });
  });
});
