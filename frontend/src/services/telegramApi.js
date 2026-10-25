import API from './api';

/**
 * Fetch current Telegram integration status for authenticated user
 */
export const getTelegramStatus = async () => {
  const response = await API.get('/telegram/status');
  return response.data;
};

/**
 * Generate a one-time pairing token and deep link
 */
export const generatePairingLink = async () => {
  const response = await API.post('/telegram/pair-token');
  return response.data;
};

/**
 * Unlink Telegram integration from user account
 */
export const unlinkTelegram = async () => {
  const response = await API.post('/telegram/unlink');
  return response.data;
};

/**
 * Update Telegram notification preferences
 * @param {{ notificationsEnabled?: boolean, dailyDigestHour?: number }} settings
 */
export const updateTelegramSettings = async (settings) => {
  const response = await API.patch('/telegram/settings', settings);
  return response.data;
};

/**
 * Send a sample/test daily digest to the linked Telegram chat
 */
export const sendTestDigest = async () => {
  const response = await API.post('/telegram/test-digest');
  return response.data;
};
