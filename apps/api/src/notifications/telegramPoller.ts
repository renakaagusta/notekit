/**
 * Long-poll fallback for local dev. In production set a webhook on the bot
 * instead (see docs/NOTIFICATIONS.md M2). This poller is no-op if either
 * (a) the bot token is missing or (b) NODE_ENV=production.
 */
import { env } from "../env";
import { consumeStartCode } from "./channels/telegram";

interface TgUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
  };
}

let stopped = false;
let lastUpdateId = 0;

export function startTelegramPoller(): void {
  if (env.isProd) return;
  if (!env.telegram.botToken) return;
  console.log("[telegram] starting long-poll worker (dev mode)");
  void pollLoop();
}

export function stopTelegramPoller(): void {
  stopped = true;
}

async function pollLoop(): Promise<void> {
  while (!stopped) {
    try {
      const url = `https://api.telegram.org/bot${env.telegram.botToken}/getUpdates?timeout=25&offset=${lastUpdateId + 1}`;
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
      console.error("[telegram] poll error:", err);
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
    const result = await consumeStartCode(code, chatId);
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
  if (!env.telegram.botToken) return;
  await fetch(
    `https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`,
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
