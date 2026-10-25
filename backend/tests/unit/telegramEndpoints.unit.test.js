import { describe, it, expect, beforeEach, vi } from 'vitest';

const telegramBotService = require('../../services/telegramBotService');
const telegramController = require('../../controllers/telegramController');

describe('telegramController Endpoints', () => {
  let req, res;

  beforeEach(() => {
    vi.restoreAllMocks();

    req = {
      user: {
        id: 'usr-1',
        name: 'Ammar',
        telegramChatId: 'chat-101',
        telegramUsername: 'ammar_dev',
        telegramNotificationsEnabled: true,
        telegramDailyDigestHour: 9,
        save: vi.fn().mockResolvedValue(true),
      },
      headers: {},
      body: {},
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    telegramBotService.botToken = 'mock_telegram_bot_token_12345';
    telegramBotService.botUsername = 'OpenPrepStudyBot';
    telegramBotService.webhookSecret = 'test_webhook_secret';
    vi.spyOn(telegramBotService, 'isConfigured').mockReturnValue(true);
    vi.spyOn(telegramBotService, 'verifyWebhookSecret').mockReturnValue(true);
  });

  describe('getTelegramStatus', () => {
    it('returns user integration status and configuration state', async () => {
      await telegramController.getTelegramStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          isConfigured: true,
          isLinked: true,
          telegramUsername: 'ammar_dev',
          notificationsEnabled: true,
          dailyDigestHour: 9,
        })
      );
    });
  });

  describe('generatePairingLink', () => {
    it('generates pairing token and returns deep link payload', async () => {
      vi.spyOn(telegramBotService, 'generatePairingToken').mockResolvedValue({
        pairingToken: 'tok123',
        pairingUrl: 'https://t.me/OpenPrepStudyBot?start=auth_tok123',
        expiresAt: new Date(),
      });

      await telegramController.generatePairingLink(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          pairingToken: 'tok123',
          pairingUrl: expect.stringContaining('auth_tok123'),
        })
      );
    });
  });

  describe('unlinkTelegram', () => {
    it('unlinks telegram account and returns success', async () => {
      vi.spyOn(telegramBotService, 'unlinkTelegramAccount').mockResolvedValue({ success: true });

      await telegramController.unlinkTelegram(req, res);

      expect(telegramBotService.unlinkTelegramAccount).toHaveBeenCalledWith(req.user);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('unlinked'),
        })
      );
    });
  });

  describe('updateTelegramSettings', () => {
    it('updates notificationsEnabled and dailyDigestHour', async () => {
      req.body = { notificationsEnabled: false, dailyDigestHour: 7 };

      await telegramController.updateTelegramSettings(req, res);

      expect(req.user.telegramNotificationsEnabled).toBe(false);
      expect(req.user.telegramDailyDigestHour).toBe(7);
      expect(req.user.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          notificationsEnabled: false,
          dailyDigestHour: 7,
        })
      );
    });

    it('validates dailyDigestHour range (0-23)', async () => {
      req.body = { dailyDigestHour: 25 };

      await telegramController.updateTelegramSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('between 0 and 23'),
        })
      );
    });
  });

  describe('sendTestDigest', () => {
    it('rejects if account is not linked', async () => {
      req.user.telegramChatId = null;

      await telegramController.sendTestDigest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('not linked'),
        })
      );
    });

    it('dispatches test digest when account is linked', async () => {
      vi.spyOn(telegramBotService, 'sendStudyDigest').mockResolvedValue({ ok: true });

      await telegramController.sendTestDigest(req, res);

      expect(telegramBotService.sendStudyDigest).toHaveBeenCalledWith(
        'chat-101',
        req.user,
        expect.any(Object)
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: expect.stringContaining('successfully'),
        })
      );
    });
  });

  describe('handleWebhook', () => {
    it('rejects update when secret token header is invalid', async () => {
      vi.spyOn(telegramBotService, 'verifyWebhookSecret').mockReturnValue(false);

      await telegramController.handleWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Unauthorized webhook secret',
        })
      );
    });

    it('processes update when secret token is valid', async () => {
      vi.spyOn(telegramBotService, 'verifyWebhookSecret').mockReturnValue(true);
      vi.spyOn(telegramBotService, 'handleWebhookUpdate').mockResolvedValue({ handled: true });
      req.body = { update_id: 1234 };

      await telegramController.handleWebhook(req, res);

      expect(telegramBotService.handleWebhookUpdate).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });
});
