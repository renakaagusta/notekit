/**
 * Long-poll fallback for local dev. In production set a webhook on the bot
 * instead (see docs/NOTIFICATIONS.md M2). This poller is no-op if either
 * (a) the bot token is missing or (b) NODE_ENV=production.
 *
 * Behaviour is identical to the previous notifications/telegramPoller
 * implementation; it now consumes start codes through the injected port and
 * reads the Telegram config passed in from the composition root.
 */
import { logger } from "../../lib/logger";
import type { TelegramStartCodePort } from "../ports/out/TelegramStartCodePort";

interface TgUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
}

export function createTelegramPoller(deps: {
  telegram: TelegramStartCodePort;
  config: { isProd: boolean; botToken: string | null };
}) {
  const { telegram, config } = deps;

  let stopped = false;
  let lastUpdateId = 0;

  function startTelegramPoller(): void {
    if (config.isProd) return;
    if (!config.botToken) return;
    void pollLoop();
  }

  function stopTelegramPoller(): void {
    stopped = true;
  }

  async function pollLoop(): Promise<void> {
    while (!stopped) {
      try {
        const url = `https://api.telegram.org/bot${config.botToken}/getUpdates?timeout=25&offset=${lastUpdateId + 1}`;
        const res = await fetch(url);
        if (!res.ok) {
          await sleep(5000);
          continue;
        }
        const json = (await res.json()) as { ok: boolean; result: TgUpdate[] };
        if (!json.ok) {
          await sleep(5000);
          continue;
        }
        for (const u of json.result) {
          lastUpdateId = Math.max(lastUpdateId, u.update_id);
          await handleUpdate(u);
        }
      } catch (err) {
        logger.error({ err }, "[telegram-poll] poll error");
        await sleep(5000);
      }
    }
  }

  async function handleUpdate(u: TgUpdate): Promise<void> {
    const msg = u.message;
    if (!msg?.text) return;
    const chatId = String(msg.chat.id);
    const text = msg.text.trim();
    if (text.startsWith("/start")) {
      const code = text.slice("/start".length).trim();
      if (!code) {
        await replyTo(chatId, "Open NoteKit → Settings → Notifications → Link Telegram.");
        return;
      }
      const result = await telegram.consumeStartCode(code, chatId);
      await replyTo(
        chatId,
        result.ok
          ? "✓ Linked to NoteKit. You'll get notifications here when an agent updates your vault."
          : result.reason === "code_expired"
            ? "That link has expired. Generate a new one in NoteKit settings."
            : "Unrecognized link code.",
      );
    }
  }

  async function replyTo(chatId: string, text: string): Promise<void> {
    if (!config.botToken) return;
    await fetch(
      `https://api.telegram.org/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    );
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  return { startTelegramPoller, stopTelegramPoller };
}
