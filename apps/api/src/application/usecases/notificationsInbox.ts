import type {
  InboxChannelPrefs,
  InboxNotificationRow,
  MobilePushTokenInput,
  NotificationsInboxRepository,
  PrefsPatch,
  WebPushSubscriptionInput,
} from "../ports/out/NotificationsInboxRepository";

/**
 * Notifications inbox + per-channel subscription use cases. Behaviour is
 * identical to the previous notifications route implementation; it now reads/
 * writes through the injected {@link NotificationsInboxRepository} instead of
 * Drizzle. Presentation (payload JSON.parse, ISO dates, cursor slicing, id/code
 * generation, expiry math) stays in the route.
 */
export function createNotificationsInbox(repo: NotificationsInboxRepository) {
  async function listInbox(
    userId: string,
    before: string | undefined,
    limit: number,
  ): Promise<InboxNotificationRow[]> {
    let cursorTs: number | null = null;
    if (before) {
      cursorTs = await repo.getNotificationCreatedAt(before);
    }
    return repo.listNotifications(userId, cursorTs, limit);
  }

  async function markRead(userId: string, id: string, readAt: number): Promise<void> {
    await repo.markRead(userId, id, readAt);
  }

  async function markAllRead(userId: string, readAt: number): Promise<void> {
    await repo.markAllRead(userId, readAt);
  }

  async function getPrefs(userId: string): Promise<InboxChannelPrefs | null> {
    return repo.getPrefs(userId);
  }

  async function hasTelegramLink(userId: string): Promise<boolean> {
    return repo.hasTelegramLink(userId);
  }

  async function upsertPrefs(
    userId: string,
    patch: PrefsPatch,
    updatedAt: number,
  ): Promise<void> {
    await repo.upsertPrefs(userId, patch, updatedAt);
  }

  async function mintTelegramLinkCode(
    code: string,
    userId: string,
    expiresAt: number,
  ): Promise<void> {
    await repo.insertTelegramLinkCode(code, userId, expiresAt);
  }

  async function unlinkTelegram(userId: string, updatedAt: number): Promise<void> {
    await repo.deleteTelegramLink(userId);
    await repo.upsertPrefs(userId, { telegramEnabled: false }, updatedAt);
  }

  async function subscribeWebPush(
    input: WebPushSubscriptionInput,
    updatedAt: number,
  ): Promise<void> {
    await repo.upsertWebPushSubscription(input);
    await repo.upsertPrefs(input.userId, { webPushEnabled: true }, updatedAt);
  }

  async function unsubscribeWebPush(userId: string, endpoint: string): Promise<void> {
    await repo.deleteWebPushSubscription(userId, endpoint);
  }

  async function subscribeMobilePush(
    input: MobilePushTokenInput,
    updatedAt: number,
  ): Promise<void> {
    await repo.upsertMobilePushToken(input);
    await repo.upsertPrefs(input.userId, { mobilePushEnabled: true }, updatedAt);
  }

  async function unsubscribeMobilePush(userId: string, token: string): Promise<void> {
    await repo.deleteMobilePushToken(userId, token);
  }

  return {
    listInbox,
    markRead,
    markAllRead,
    getPrefs,
    hasTelegramLink,
    upsertPrefs,
    mintTelegramLinkCode,
    unlinkTelegram,
    subscribeWebPush,
    unsubscribeWebPush,
    subscribeMobilePush,
    unsubscribeMobilePush,
  };
}
