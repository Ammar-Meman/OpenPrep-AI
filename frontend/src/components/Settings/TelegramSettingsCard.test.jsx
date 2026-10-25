import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TelegramSettingsCard from './TelegramSettingsCard';
import * as telegramApi from '../../services/telegramApi';

vi.mock('../../services/telegramApi', () => ({
  getTelegramStatus: vi.fn(),
  generatePairingLink: vi.fn(),
  unlinkTelegram: vi.fn(),
  updateTelegramSettings: vi.fn(),
  sendTestDigest: vi.fn(),
}));

describe('TelegramSettingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders unlinked state when telegram account is not linked', async () => {
    telegramApi.getTelegramStatus.mockResolvedValue({
      success: true,
      isConfigured: true,
      isLinked: false,
      telegramUsername: null,
      notificationsEnabled: false,
      dailyDigestHour: 8,
      botUsername: 'OpenPrepStudyBot',
    });

    render(<TelegramSettingsCard />);

    await waitFor(() => {
      expect(screen.getByText('Telegram Study Bot')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /connect telegram bot/i })).toBeInTheDocument();
    expect(screen.queryByText(/connected as/i)).not.toBeInTheDocument();
  });

  it('generates pairing link and displays deep link instructions on connect click', async () => {
    telegramApi.getTelegramStatus.mockResolvedValue({
      success: true,
      isConfigured: true,
      isLinked: false,
      telegramUsername: null,
      notificationsEnabled: false,
      dailyDigestHour: 8,
      botUsername: 'OpenPrepStudyBot',
    });

    telegramApi.generatePairingLink.mockResolvedValue({
      success: true,
      pairingToken: 'mock_tok_456',
      pairingUrl: 'https://t.me/OpenPrepStudyBot?start=auth_mock_tok_456',
      expiresAt: new Date(Date.now() + 900000),
    });

    // Mock window.open
    const originalOpen = window.open;
    window.open = vi.fn();

    render(<TelegramSettingsCard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connect telegram bot/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /connect telegram bot/i }));

    await waitFor(() => {
      expect(telegramApi.generatePairingLink).toHaveBeenCalled();
      expect(screen.getByText(/pairing link generated/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /open @openprepstudybot/i })).toBeInTheDocument();
    });

    window.open = originalOpen;
  });

  it('renders linked state with account username, toggle, and test digest button', async () => {
    telegramApi.getTelegramStatus.mockResolvedValue({
      success: true,
      isConfigured: true,
      isLinked: true,
      telegramUsername: 'studious_ammar',
      notificationsEnabled: true,
      dailyDigestHour: 9,
      botUsername: 'OpenPrepStudyBot',
    });

    render(<TelegramSettingsCard />);

    await waitFor(() => {
      expect(screen.getByText(/@studious_ammar/i)).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /send test digest/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlink/i })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /toggle telegram notifications/i })).toBeInTheDocument();
  });

  it('triggers test digest dispatch when button clicked', async () => {
    telegramApi.getTelegramStatus.mockResolvedValue({
      success: true,
      isConfigured: true,
      isLinked: true,
      telegramUsername: 'studious_ammar',
      notificationsEnabled: true,
      dailyDigestHour: 9,
      botUsername: 'OpenPrepStudyBot',
    });

    telegramApi.sendTestDigest.mockResolvedValue({ success: true, message: 'Test digest sent' });

    render(<TelegramSettingsCard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /send test digest/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /send test digest/i }));

    await waitFor(() => {
      expect(telegramApi.sendTestDigest).toHaveBeenCalled();
      expect(screen.getByText(/test digest sent to your telegram chat/i)).toBeInTheDocument();
    });
  });

  it('unlinks account when confirm is accepted', async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    telegramApi.getTelegramStatus.mockResolvedValue({
      success: true,
      isConfigured: true,
      isLinked: true,
      telegramUsername: 'studious_ammar',
      notificationsEnabled: true,
      dailyDigestHour: 9,
      botUsername: 'OpenPrepStudyBot',
    });

    telegramApi.unlinkTelegram.mockResolvedValue({ success: true });

    render(<TelegramSettingsCard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /unlink/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /unlink/i }));

    await waitFor(() => {
      expect(telegramApi.unlinkTelegram).toHaveBeenCalled();
      expect(screen.getByText(/telegram account unlinked successfully/i)).toBeInTheDocument();
    });

    window.confirm = originalConfirm;
  });
});
