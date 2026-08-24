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
import { db, schema } from "../adapters/driven/db";
import { sendMobilePush } from "../adapters/driven/notifications/mobilepush";
import { sendTelegram } from "../adapters/driven/notifications/telegram";
import { sendWebPush } from "../adapters/driven/notifications/webpush";
import { logger } from '../lib/logger'

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

  // Fire-and-forget: persist the notification then fan out to channels.
  void (async () => {
    try {
      await db.insert(schema.notifications).values(row).execute();
    } catch (err) {
      logger.error({ err }, "[notifications] persist failed")
      return;
    }
    await dispatch(input.userId, summary, row.id, payload);
  })();
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
      sendTelegram(userId, summary, notificationId).catch((e) => logger.warn("[notifications] telegram dispatch failed", e)),
    );
  }
  if (prefs.webPushEnabled) {
    tasks.push(
      sendWebPush(userId, summary, notificationId, payload).catch((e) => logger.warn("[notifications] webpush dispatch failed", e)),
    );
  }
  if (prefs.mobilePushEnabled) {
    tasks.push(
      sendMobilePush(userId, summary, notificationId, payload).catch((e) => logger.warn("[notifications] mobilepush dispatch failed", e)),
    );
  }
  await Promise.allSettled(tasks);
}
