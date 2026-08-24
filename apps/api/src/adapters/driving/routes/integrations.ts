/**
 * Integration webhooks. Currently:
 * - Telegram bot webhook → handles /start <code> link flow.
 *
 * Production runs as a webhook (Telegram POSTs to us). Dev runs a long-poll
 * worker in `services/telegramPoller.ts`.
 */
import { Hono } from "hono";
import { consumeTelegramStartCode } from "../../../composition/notifications";
import { env } from "../../../env";
import { logger } from '../../../lib/logger'
import { requireWebhookSecret } from '../middleware/webhook-auth'

export const integrationsRoutes = new Hono();

interface TelegramUpdate {
  message?: {
    chat: { id: number; type: string };
    from?: { id: number; username?: string };
    text?: string;
  };
}

/**
 * POST /integrations/telegram/webhook?secret=<TELEGRAM_WEBHOOK_SECRET>
 *
 * Telegram supports a custom path secret OR an `X-Telegram-Bot-Api-Secret-Token`
 * header. We accept either.
 */
integrationsRoutes.post("/telegram/webhook", requireWebhookSecret("TELEGRAM_WEBHOOK_SECRET", { scheme: "telegram" }), async (c) => {
  if (!env.telegram.botToken) return c.json({ error: "not_configured" }, 503);
  const update = (await c.req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update?.message?.text) return c.json({ ok: true });

  const text = update.message.text.trim();
  const chatId = String(update.message.chat.id);

  if (text.startsWith("/start")) {
    const code = text.slice("/start".length).trim();
    if (!code) {
      await sendBotMessage(
        chatId,
        "Open NoteKit → Settings → Notifications → Link Telegram, then tap the link there.",
      );
      return c.json({ ok: true });
    }
    const result = await consumeTelegramStartCode(code, chatId);
    if (result.ok) {
      await sendBotMessage(
        chatId,
        "✓ Linked to NoteKit. You'll get notifications here when an agent updates your vault.",
      );
    } else {
      const msg =
        result.reason === "code_expired"
          ? "That link has expired. Generate a new one in NoteKit → Settings → Notifications."
          : "Unrecognized link code. Generate a new one in NoteKit → Settings → Notifications.";
      await sendBotMessage(chatId, msg);
    }
    return c.json({ ok: true });
  }

  if (text === "/help" || text === "/start") {
    await sendBotMessage(
      chatId,
      "NoteKit bot. Use the link from your NoteKit settings to connect this chat.",
    );
  }

  return c.json({ ok: true });
});

async function sendBotMessage(chatId: string, text: string): Promise<void> {
  if (!env.telegram.botToken) return;
  await fetch(
    `https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  ).catch((err) => logger.warn("[integrations] telegram message send failed", err));
}
