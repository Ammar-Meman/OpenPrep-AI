import { describe, it, expect, beforeEach, vi } from 'vitest';

const cron = require('node-cron');
const { User, Flashcard, FlashcardDeck } = require('../../models');
const telegramBotService = require('../../services/telegramBotService');
const {
  dispatchDailyTelegramDigests,
  dispatchStreakProtectionAlerts,
  initDailyTelegramDigestCron,
} = require('../../jobs/dailyTelegramDigestJob');

describe('dailyTelegramDigestJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(cron, 'schedule').mockReturnValue({});
    telegramBotService.botToken = 'mock_token_123';
  });

  describe('dispatchDailyTelegramDigests', () => {
    it('queries users scheduled for the target hour and dispatches digests', async () => {
      const mockUsers = [
        {
          id: 'u1',
          name: 'Alex',
          telegramChatId: 'chat-alex',
          telegramDailyDigestHour: 8,
          telegramNotificationsEnabled: true,
        },
        {
          id: 'u2',
          name: 'Sam',
          telegramChatId: 'chat-sam',
          telegramDailyDigestHour: 8,
          telegramNotificationsEnabled: true,
        },
      ];

      vi.spyOn(User, 'findAll').mockResolvedValue(mockUsers);
      vi.spyOn(Flashcard, 'count').mockResolvedValue(12);
      vi.spyOn(FlashcardDeck, 'findAll').mockResolvedValue([
        { id: 'd1', title: 'Biology' },
      ]);
      vi.spyOn(telegramBotService, 'sendStudyDigest').mockResolvedValue({ ok: true });

      await dispatchDailyTelegramDigests(8);

      expect(User.findAll).toHaveBeenCalled();
      expect(telegramBotService.sendStudyDigest).toHaveBeenCalledTimes(2);
      expect(telegramBotService.sendStudyDigest).toHaveBeenCalledWith(
        'chat-alex',
        mockUsers[0],
        expect.objectContaining({ dueCardsCount: 12 })
      );
    });
  });

  describe('dispatchStreakProtectionAlerts', () => {
    it('identifies at-risk users and dispatches streak warnings', async () => {
      const mockAtRiskUsers = [
        {
          id: 'u3',
          name: 'Jordan',
          telegramChatId: 'chat-jordan',
          streakCount: 5,
          telegramNotificationsEnabled: true,
        },
      ];

      vi.spyOn(User, 'findAll').mockResolvedValue(mockAtRiskUsers);
      vi.spyOn(telegramBotService, 'sendStreakProtectionAlert').mockResolvedValue({ ok: true });

      await dispatchStreakProtectionAlerts();

      expect(User.findAll).toHaveBeenCalled();
      expect(telegramBotService.sendStreakProtectionAlert).toHaveBeenCalledWith(
        'chat-jordan',
        mockAtRiskUsers[0]
      );
    });
  });

  describe('initDailyTelegramDigestCron', () => {
    it('registers hourly and evening cron schedules', () => {
      initDailyTelegramDigestCron();

      expect(cron.schedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function));
      expect(cron.schedule).toHaveBeenCalledWith('0 19 * * *', expect.any(Function));
    });
  });
});
