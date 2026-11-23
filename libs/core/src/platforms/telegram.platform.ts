import { Platform } from '@reliability/core/platforms/platform.interface';

const call = async (
  credentials: Record<string, string>,
  method: string,
  body?: Record<string, unknown>
) => {
  const response = await fetch(
    `https://api.telegram.org/bot${credentials.botToken}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }
  );
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
  };
  return { status: response.status, ok: !!data.ok, description: data.description };
};

export const telegramPlatform: Platform = {
  identifier: 'telegram',
  fields: [
    { key: 'botToken', label: 'Bot token', secret: true },
    { key: 'chatId', label: 'Chat ID or @channel username', secret: false },
  ],
  async check(credentials) {
    try {
      const result = await call(credentials, 'getMe');
      return result.ok
        ? { ok: true }
        : { ok: false, error: `Telegram getMe failed: ${result.status} ${result.description || ''}`.trim() };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
  async remove(credentials, releaseURL) {
    const messageId = Number(releaseURL.split(/[?#]/)[0].split('/').pop());
    if (!messageId || !credentials.chatId) {
      return { ok: false, error: 'no message id in the URL or no chat id saved' };
    }
    try {
      const result = await call(credentials, 'deleteMessage', {
        chat_id: credentials.chatId,
        message_id: messageId,
      });
      return result.ok
        ? { ok: true }
        : { ok: false, error: `deleteMessage failed: ${result.status} ${result.description || ''}`.trim() };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
