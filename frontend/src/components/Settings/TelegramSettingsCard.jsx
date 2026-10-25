import { useState, useEffect, useCallback } from 'react';
import {
  Send,
  ExternalLink,
  RefreshCw,
  Flame,
  Bell,
  Clock,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  getTelegramStatus,
  generatePairingLink,
  unlinkTelegram,
  updateTelegramSettings,
  sendTestDigest,
} from '../../services/telegramApi';

export default function TelegramSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [pairingData, setPairingData] = useState(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [testingDigest, setTestingDigest] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getTelegramStatus();
      if (data.success) {
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch Telegram status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleGeneratePairing = async () => {
    try {
      setGeneratingLink(true);
      setFeedback(null);
      const data = await generatePairingLink();
      if (data.success) {
        setPairingData(data);
        if (data.pairingUrl) {
          window.open(data.pairingUrl, '_blank', 'noopener,noreferrer');
        }
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to generate pairing link. Please try again.',
      });
    } finally {
      setGeneratingLink(false);
    }
  };

  const handleToggleNotifications = async () => {
    if (!status) return;
    try {
      setUpdatingSettings(true);
      setFeedback(null);
      const nextState = !status.notificationsEnabled;
      const res = await updateTelegramSettings({ notificationsEnabled: nextState });
      if (res.success) {
        setStatus((prev) => ({ ...prev, notificationsEnabled: nextState }));
        setFeedback({
          type: 'success',
          message: nextState
            ? 'Daily study digests and streak alerts enabled!'
            : 'Telegram notifications paused.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to update notification preferences.',
      });
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleDigestHourChange = async (e) => {
    const hour = parseInt(e.target.value, 10);
    try {
      setUpdatingSettings(true);
      setFeedback(null);
      const res = await updateTelegramSettings({ dailyDigestHour: hour });
      if (res.success) {
        setStatus((prev) => ({ ...prev, dailyDigestHour: hour }));
        setFeedback({
          type: 'success',
          message: `Daily review digest scheduled for ${hour.toString().padStart(2, '0')}:00.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to update digest time.',
      });
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleSendTestDigest = async () => {
    try {
      setTestingDigest(true);
      setFeedback(null);
      const res = await sendTestDigest();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: 'Test digest sent to your Telegram chat! Check your Telegram app.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to send test digest.',
      });
    } finally {
      setTestingDigest(false);
    }
  };

  const handleUnlink = async () => {
    if (!window.confirm('Are you sure you want to disconnect Telegram notifications?')) return;
    try {
      setUnlinking(true);
      setFeedback(null);
      const res = await unlinkTelegram();
      if (res.success) {
        setStatus((prev) => ({
          ...prev,
          isLinked: false,
          telegramUsername: null,
          notificationsEnabled: false,
        }));
        setPairingData(null);
        setFeedback({
          type: 'success',
          message: 'Telegram account unlinked successfully.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || 'Failed to unlink Telegram account.',
      });
    } finally {
      setUnlinking(false);
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: `${i.toString().padStart(2, '0')}:00 ${i < 12 ? 'AM' : 'PM'}`,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-sky-500/10 dark:bg-sky-500/20 flex items-center justify-center text-sky-500 shrink-0">
            <Send className="w-5 h-5 -rotate-12 translate-x-0.5" />
          </div>
          <div>
            <h2 className="text-2xl font-bold font-playfair text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
              Telegram Study Bot
              <span className="text-xs px-2 py-0.5 rounded-full font-sans font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
                Bot Integration
              </span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Receive automated morning card review digests and emergency streak protection alerts directly on Telegram.
            </p>
          </div>
        </div>

        {status?.isLinked && (
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-full text-emerald-700 dark:text-emerald-300 text-xs font-semibold self-start sm:self-auto">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Connected</span>
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          role="status"
          className={`flex items-start gap-3 p-3.5 rounded-sm border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
          )}
          <span className="flex-1">{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-60 hover:opacity-100 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-8 text-neutral-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span>Loading Telegram integration...</span>
        </div>
      ) : !status?.isLinked ? (
        /* Unlinked State */
        <div className="p-5 bg-neutral-100/60 dark:bg-neutral-800/60 border border-neutral-300 dark:border-neutral-600 rounded-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-playfair font-bold text-lg text-neutral-800 dark:text-neutral-100">
                Link Your Telegram Account
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 max-w-xl">
                Get morning card review digests with interactive review buttons and timely alerts before your study streak resets at midnight.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGeneratePairing}
              disabled={generatingLink}
              className="px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-sm text-sm font-semibold shadow flex items-center justify-center gap-2 transition-all disabled:opacity-50 shrink-0"
            >
              {generatingLink ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 -rotate-12" />
                  <span>Connect Telegram Bot</span>
                </>
              )}
            </button>
          </div>

          {/* Pairing token instructions modal / card */}
          {pairingData && (
            <div className="mt-4 p-4 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/60 rounded-sm space-y-3">
              <div className="flex items-center gap-2 text-sky-800 dark:text-sky-200 font-medium text-sm">
                <Sparkles className="w-4 h-4 text-sky-500" />
                <span>Pairing link generated! Complete pairing in Telegram:</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={pairingData.pairingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-sm inline-flex items-center gap-1.5 shadow"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open @{status?.botUsername || 'OpenPrepStudyBot'}</span>
                </a>

                <button
                  type="button"
                  onClick={fetchStatus}
                  className="px-3 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-200 text-xs font-medium rounded-sm inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>I've Started the Bot (Verify)</span>
                </button>
              </div>

              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Or manually send <code className="px-1.5 py-0.5 bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 rounded font-mono text-xs">/start auth_{pairingData.pairingToken}</code> to the bot.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Linked State */
        <div className="space-y-4">
          {/* Linked Account Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-neutral-100/60 dark:bg-neutral-800/60 border border-neutral-300 dark:border-neutral-600 rounded-sm">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0 mt-0.5">
                <Send className="w-4 h-4 -rotate-12" />
              </div>
              <div>
                <p className="font-playfair font-bold text-base text-neutral-800 dark:text-neutral-100">
                  Linked Account: {status.telegramUsername ? `@${status.telegramUsername}` : 'Active Telegram Session'}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Bot: @{status.botUsername || 'OpenPrepStudyBot'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSendTestDigest}
                disabled={testingDigest}
                className="px-3.5 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-800 dark:text-neutral-100 rounded-sm text-xs font-semibold shadow transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {testingDigest ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 -rotate-12 text-sky-500" />
                )}
                <span>Send Test Digest</span>
              </button>

              <button
                type="button"
                onClick={handleUnlink}
                disabled={unlinking}
                className="px-3.5 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-950/30 dark:hover:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800/50 rounded-sm text-xs font-semibold shadow transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {unlinking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Unlink</span>
              </button>
            </div>
          </div>

          {/* Preferences Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Notification Toggle */}
            <div className="p-4 bg-neutral-100/60 dark:bg-neutral-800/60 border border-neutral-300 dark:border-neutral-600 rounded-sm flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0" />
                <div>
                  <p className="font-playfair font-bold text-sm text-neutral-800 dark:text-neutral-100">
                    Daily Revision Digest
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Flashcard review queue and top decks
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={status.notificationsEnabled}
                aria-label="Toggle Telegram notifications"
                onClick={handleToggleNotifications}
                disabled={updatingSettings}
                className="relative inline-flex items-center h-7 w-12 rounded-full bg-neutral-300 dark:bg-neutral-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 shrink-0"
              >
                <span
                  className={`inline-block w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                    status.notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Preferred Digest Time */}
            <div className="p-4 bg-neutral-100/60 dark:bg-neutral-800/60 border border-neutral-300 dark:border-neutral-600 rounded-sm flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
                <div>
                  <p className="font-playfair font-bold text-sm text-neutral-800 dark:text-neutral-100">
                    Digest Morning Hour
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Scheduled dispatch time
                  </p>
                </div>
              </div>

              <select
                value={status.dailyDigestHour ?? 8}
                onChange={handleDigestHourChange}
                disabled={updatingSettings || !status.notificationsEnabled}
                className="px-2.5 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-100 text-xs rounded-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
              >
                {hours.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Streak Protection Notification Info Banner */}
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-sm flex items-center gap-3 text-xs text-amber-800 dark:text-amber-200">
            <Flame className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Streak Protection Active:</strong> The bot will automatically notify you at 7:00 PM if your study streak is at risk of expiring at midnight, with one-tap Streak Freeze activation.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
