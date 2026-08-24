import type {
  InboxNotificationRecord,
  InboxPrefs,
  MobilePushSubscriptionInput,
  NotificationsInboxRepository,
  PrefsPatch,
  WebPushSubscriptionInput,
} from "../ports/out/NotificationsInboxRepository";

export interface InboxChannelStatus {
  prefs: InboxPrefs;
  telegramLinked: boolean;
}

/**
 * Notifications inbox + per-channel subscription use cases. Behaviour is
 * identical to the previous route-inlined implementation; it now reads/writes
 * through the injected {@link NotificationsInboxRepository} instead of Drizzle.
 */
export function createNotificationsInbox(repo: NotificationsInboxRepository) {
  async function listInbox(
    userId: string,
    limit: number,
    before: string | undefined,
  ): Promise<InboxNotificationRecord[]> {
    let cursorTs: number | null = null;
    if (before) {
      cursorTs = await repo.getCursorCreatedAt(before);
    }
    return repo.listNotifications(userId, limit, cursorTs);
  }

  async function markRead(userId: string, id: string): Promise<void> {
    await repo.markRead(userId, id);
  }

  async function markAllRead(userId: string): Promise<void> {
    await repo.markAllRead(userId);
  }

  async function getChannelStatus(userId: string): Promise<InboxChannelStatus> {
    const prefs = await repo.getPrefs(userId);
    const telegramLinked = await repo.isTelegramLinked(userId);
    return {
      prefs: {
        telegramEnabled: prefs?.telegramEnabled ?? false,
        webPushEnabled: prefs?.webPushEnabled ?? false,
        mobilePushEnabled: prefs?.mobilePushEnabled ?? false,
      },
      telegramLinked,
    };
  }

  async function updatePrefs(userId: string, patch: PrefsPatch): Promise<void> {
    await repo.upsertPrefs(userId, patch);
  }

  async function mintTelegramLinkCode(
    userId: string,
    code: string,
    expiresAt: number,
  ): Promise<void> {
    await repo.insertTelegramLinkCode(code, userId, expiresAt);
  }

  async function unlinkTelegram(userId: string): Promise<void> {
    await repo.unlinkTelegram(userId);
  }

  async function subscribeWebPush(
    userId: string,
    sub: WebPushSubscriptionInput,
  ): Promise<void> {
    await repo.subscribeWebPush(userId, sub);
  }

  async function unsubscribeWebPush(userId: string, endpoint: string): Promise<void> {
    await repo.unsubscribeWebPush(userId, endpoint);
  }

  async function subscribeMobilePush(
    userId: string,
    sub: MobilePushSubscriptionInput,
  ): Promise<void> {
    await repo.subscribeMobilePush(userId, sub);
  }

  async function unsubscribeMobilePush(userId: string, token: string): Promise<void> {
    await repo.unsubscribeMobilePush(userId, token);
  }

  return {
    listInbox,
    markRead,
    markAllRead,
    getChannelStatus,
    updatePrefs,
    mintTelegramLinkCode,
    unlinkTelegram,
    subscribeWebPush,
    unsubscribeWebPush,
    subscribeMobilePush,
    unsubscribeMobilePush,
  };
}
