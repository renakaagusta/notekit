/**
 * Composition root for the notification use cases: binds the emit + Telegram
 * poller use cases to the Drizzle repository and the channel adapters. Routes
 * and the server entry import the wired functions from here.
 */
import { notificationsInboxRepository } from "../adapters/driven/db/notificationsInboxRepository";
import { sendMobilePush } from "../adapters/driven/notifications/mobilepush";
import { notificationsRepository } from "../adapters/driven/notifications/notificationsRepository";
import { consumeStartCode, sendTelegram } from "../adapters/driven/notifications/telegram";
import { sendWebPush } from "../adapters/driven/notifications/webpush";
import { createEmitAgentEvent } from "../application/usecases/emitAgentEvent";
import { createNotificationsInbox } from "../application/usecases/notificationsInbox";
import { createTelegramPoller } from "../application/usecases/telegramPoller";
import { env } from "../env";

const emit = createEmitAgentEvent({
  repo: notificationsRepository,
  channels: { sendTelegram, sendWebPush, sendMobilePush },
});

const poller = createTelegramPoller({
  telegram: { consumeStartCode },
  config: { isProd: env.isProd, botToken: env.telegram.botToken },
});

export const notificationsInbox = createNotificationsInbox(notificationsInboxRepository);

export const emitAgentEvent = emit.emitAgentEvent;
export const startTelegramPoller = poller.startTelegramPoller;
export const stopTelegramPoller = poller.stopTelegramPoller;
export const consumeTelegramStartCode = consumeStartCode;
