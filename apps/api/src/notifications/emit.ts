/**
 * Single fan-out point for "agent did something" events.
 *
 * Always inserts a row into `notifications` (durable inbox). Then, based on
 * the user's per-channel prefs, dispatches to Telegram / Web Push / Mobile
 * Push in the background — never blocks the originating vault response.
 *
 * Channels swallow their own errors. A failed channel must never poison the
 * write request that triggered the event.
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db";
import { sendTelegram } from "./channels/telegram";
import { sendWebPush } from "./channels/webpush";
import { sendMobilePush } from "./channels/mobilepush";

export type AgentEventType = "file.write" | "file.delete" | "device.paired";

export interface AgentEventInput {
  userId: string;
  agentSlug: string;
  eventType: AgentEventType;
  resourcePath: string;
  extra?: Record<string, unknown>;
}

function summaryFor(input: AgentEventInput): string {
  if (input.eventType === "device.paired") {
    const name = (input.extra?.deviceName as string | undefined) || "A new device";
    return `${name} was paired with your account`;
  }
  const verb = input.eventType === "file.delete" ? "deleted" : "updated";
  return `${input.agentSlug} ${verb} ${input.resourcePath}`;
}

export function emitAgentEvent(input: AgentEventInput): void {
  const payload = {
    eventType: input.eventType,
    resourcePath: input.resourcePath,
    agentSlug: input.agentSlug,
    ...(input.extra ?? {}),
  };
  const summary = summaryFor(input);
  const row = {
    id: `ntf_${nanoid(16)}`,
    userId: input.userId,
    agentSlug: input.agentSlug,
    eventType: input.eventType,
    resourcePath: input.resourcePath,
    summary,
    payload: JSON.stringify(payload),
  };

  // Inbox write is synchronous — cheap, in-process SQLite.
  try {
    db.insert(schema.notifications).values(row).run();
  } catch (err) {
    console.error("[notify] failed to persist notification:", err);
    return;
  }

  // Channel fan-out is fire-and-forget. Each dispatcher reads prefs itself
  // so adding a channel later doesn't require touching emit().
  void dispatch(input.userId, summary, row.id, payload);
}

async function dispatch(
  userId: string,
  summary: string,
  notificationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const prefs = await db.query.notificationPrefs.findFirst({
    where: eq(schema.notificationPrefs.userId, userId),
  });
  if (!prefs) return;
  const tasks: Promise<unknown>[] = [];
  if (prefs.telegramEnabled) {
    tasks.push(
      sendTelegram(userId, summary, notificationId).catch((err) =>
        console.error("[notify:telegram]", err),
      ),
    );
  }
  if (prefs.webPushEnabled) {
    tasks.push(
      sendWebPush(userId, summary, notificationId, payload).catch((err) =>
        console.error("[notify:webpush]", err),
      ),
    );
  }
  if (prefs.mobilePushEnabled) {
    tasks.push(
      sendMobilePush(userId, summary, notificationId, payload).catch((err) =>
        console.error("[notify:mobilepush]", err),
      ),
    );
  }
  await Promise.allSettled(tasks);
}
