/**
 * Telegram channel. M2 fills this in. See docs/NOTIFICATIONS.md.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { env } from "../../env";

export async function sendTelegram(
  userId: string,
  summary: string,
  _notificationId: string,
): Promise<void> {
  if (!env.telegram.botToken) return;
  const link = await db.query.telegramLinks.findFirst({
    where: eq(schema.telegramLinks.userId, userId),
  });
  if (!link) return;
  const res = await fetch(
    `https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: link.chatId,
        text: summary,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`telegram_send_${res.status}: ${body.slice(0, 200)}`);
  }
}

/**
 * Reply to /start <code> from the bot webhook. Looks up the code, binds the
 * chat to the user, returns the message body Telegram should reply with.
 */
export async function consumeStartCode(
  code: string,
  chatId: string,
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const row = await db.query.telegramLinkCodes.findFirst({
    where: eq(schema.telegramLinkCodes.code, code),
  });
  if (!row) return { ok: false, reason: "code_not_found" };
  if (row.expiresAt.getTime() < Date.now()) {
    await db
      .delete(schema.telegramLinkCodes)
      .where(eq(schema.telegramLinkCodes.code, code))
      .run();
    return { ok: false, reason: "code_expired" };
  }
  // Upsert link, drop the code (single-use).
  await db
    .insert(schema.telegramLinks)
    .values({
      userId: row.userId,
      chatId,
      linkedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.telegramLinks.userId,
      set: { chatId, linkedAt: new Date() },
    })
    .run();
  await db
    .delete(schema.telegramLinkCodes)
    .where(eq(schema.telegramLinkCodes.code, code))
    .run();
  // Default to enabling the channel — user explicitly asked to link.
  await db
    .insert(schema.notificationPrefs)
    .values({
      userId: row.userId,
      telegramEnabled: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.notificationPrefs.userId,
      set: { telegramEnabled: true, updatedAt: new Date() },
    })
    .run();
  return { ok: true, userId: row.userId };
}
