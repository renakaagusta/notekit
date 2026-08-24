/**
 * Single fan-out point for "agent did something" events.
 *
 * Always inserts a row into `notifications` (durable inbox). Then, based on
 * the user's per-channel prefs, dispatches to Telegram / Web Push / Mobile
 * Push in the background — never blocks the originating vault response.
 *
 * Channels swallow their own errors. A failed channel must never poison the
 * write request that triggered the event.
 *
 * Behaviour is identical to the previous notifications/emit implementation; it
 * now reads/writes through the injected ports instead of Drizzle and the
 * channel adapters.
 */
import type { AgentEventInput } from "../../domain/notification-event";
import { logger } from "../../lib/logger";
import type { NotificationChannelsPort } from "../ports/out/NotificationChannelsPort";
import type { NotificationsRepository } from "../ports/out/NotificationsRepository";

function summaryFor(input: AgentEventInput): string {
  if (input.eventType === "device.paired") {
    const name = (input.extra?.deviceName as string | undefined) || "A new device";
    return `${name} was paired with your account`;
  }
  const verb = input.eventType === "file.delete" ? "deleted" : "updated";
  return `${input.agentSlug} ${verb} ${input.resourcePath}`;
}

export function createEmitAgentEvent(deps: {
  repo: NotificationsRepository;
  channels: NotificationChannelsPort;
}) {
  const { repo, channels } = deps;

  async function dispatch(
    userId: string,
    summary: string,
    notificationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const prefs = await repo.getChannelPrefs(userId);
    if (!prefs) return;
    const tasks: Promise<unknown>[] = [];
    if (prefs.telegramEnabled) {
      tasks.push(
        channels.sendTelegram(userId, summary, notificationId).catch((e) => logger.warn("[notifications] telegram dispatch failed", e)),
      );
    }
    if (prefs.webPushEnabled) {
      tasks.push(
        channels.sendWebPush(userId, summary, notificationId, payload).catch((e) => logger.warn("[notifications] webpush dispatch failed", e)),
      );
    }
    if (prefs.mobilePushEnabled) {
      tasks.push(
        channels.sendMobilePush(userId, summary, notificationId, payload).catch((e) => logger.warn("[notifications] mobilepush dispatch failed", e)),
      );
    }
    await Promise.allSettled(tasks);
  }

  function emitAgentEvent(input: AgentEventInput): void {
    const payload = {
      eventType: input.eventType,
      resourcePath: input.resourcePath,
      agentSlug: input.agentSlug,
      ...(input.extra ?? {}),
    };
    const summary = summaryFor(input);
    const row = {
      id: repo.newNotificationId(),
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
        await repo.insertNotification(row);
      } catch (err) {
        logger.error({ err }, "[notifications] persist failed");
        return;
      }
      await dispatch(input.userId, summary, row.id, payload);
    })();
  }

  return { emitAgentEvent };
}
