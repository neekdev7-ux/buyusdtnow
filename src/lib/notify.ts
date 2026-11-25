// Telegram notifications to the admin (and to users for support replies).
// Fire-and-forget: never throws, never blocks order processing.
// Requires TELEGRAM_BOT_TOKEN; admin messages additionally need ADMIN_TELEGRAM_ID.

const API_BASE = 'https://api.telegram.org';

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Send a message to the admin (ADMIN_TELEGRAM_ID). Returns false when unconfigured. */
export async function notifyAdmin(text: string): Promise<boolean> {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return false;
  return sendTelegramMessage(adminId, text);
}
