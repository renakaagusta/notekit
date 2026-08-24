/**
 * Outbound port for the notifications inbox + per-channel subscription store.
 * The notifications route depends on this instead of Drizzle directly, so the
 * Postgres queries live in a driven adapter. Behaviour is identical to the
 * previous route-inlined queries.
 */
export interface InboxNotificationRecord {
  id: string;
  agentSlug: string;
  eventType: string;
  resourcePath: string | null;
  summary: string;
  payload: string;
  createdAt: number;
  readAt: number | null;
}

export interface InboxPrefs {
  telegramEnabled: boolean;
  webPushEnabled: boolean;
  mobilePushEnabled: boolean;
}

export interface PrefsPatch {
  telegramEnabled?: boolean;
  webPushEnabled?: boolean;
  mobilePushEnabled?: boolean;
}

export interface WebPushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

export interface MobilePushSubscriptionInput {
  platform: "ios" | "android";
  token: string;
  deviceId: string | null;
}

export interface NotificationsInboxRepository {
  /** The `createdAt` cursor for a notification id, or null when unknown. */
  getCursorCreatedAt(id: string): Promise<number | null>;

  /** Newest-first inbox page for the user; `beforeCreatedAt` filters older. */
  listNotifications(
    userId: string,
    limit: number,
    beforeCreatedAt: number | null,
  ): Promise<InboxNotificationRecord[]>;

  /** Mark a single notification read (scoped to the user). */
  markRead(userId: string, id: string): Promise<void>;

  /** Mark all of the user's notifications read. */
  markAllRead(userId: string): Promise<void>;

  /** The user's per-channel prefs, or null when no prefs row exists. */
  getPrefs(userId: string): Promise<InboxPrefs | null>;

  /** True when the user has a Telegram link. */
  isTelegramLinked(userId: string): Promise<boolean>;

  /** Upsert the user's prefs from a partial patch. */
  upsertPrefs(userId: string, patch: PrefsPatch): Promise<void>;

  /** Insert a one-time Telegram start code with an absolute expiry. */
  insertTelegramLinkCode(
    code: string,
    userId: string,
    expiresAt: number,
  ): Promise<void>;

  /** Remove the Telegram link and disable the channel. */
  unlinkTelegram(userId: string): Promise<void>;

  /** Upsert a web-push subscription and enable the channel. */
  subscribeWebPush(userId: string, sub: WebPushSubscriptionInput): Promise<void>;

  /** Remove a web-push subscription by endpoint. */
  unsubscribeWebPush(userId: string, endpoint: string): Promise<void>;

  /** Upsert a mobile-push token and enable the channel. */
  subscribeMobilePush(
    userId: string,
    sub: MobilePushSubscriptionInput,
  ): Promise<void>;

  /** Remove a mobile-push token. */
  unsubscribeMobilePush(userId: string, token: string): Promise<void>;
}
