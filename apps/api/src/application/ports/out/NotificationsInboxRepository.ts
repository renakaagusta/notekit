/**
 * Outbound port for the notifications inbox + per-channel subscription store. The
 * notifications route depends on this instead of Drizzle, so the Postgres queries
 * live in a driven adapter. Presentation (JSON.parse of payload, ISO dates,
 * cursor slicing, id/code generation, expiry math) stays in the route.
 */
export interface InboxNotificationRow {
  id: string;
  agentSlug: string;
  eventType: string;
  resourcePath: string | null;
  summary: string;
  payload: string;
  createdAt: number;
  readAt: number | null;
}

export interface InboxChannelPrefs {
  telegramEnabled: boolean;
  webPushEnabled: boolean;
  mobilePushEnabled: boolean;
}

export interface WebPushSubscriptionInput {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

export interface MobilePushTokenInput {
  id: string;
  userId: string;
  platform: "ios" | "android";
  token: string;
  deviceId: string | null;
}

export interface PrefsPatch {
  telegramEnabled?: boolean;
  webPushEnabled?: boolean;
  mobilePushEnabled?: boolean;
}

export interface NotificationsInboxRepository {
  /** The createdAt timestamp of a notification by id, or null when absent. */
  getNotificationCreatedAt(id: string): Promise<number | null>;

  /**
   * List a user's notifications newest-first, limited to `limit`. When
   * `cursorTs` is set, only rows strictly older than it are returned.
   */
  listNotifications(
    userId: string,
    cursorTs: number | null,
    limit: number,
  ): Promise<InboxNotificationRow[]>;

  /** Mark one notification read (scoped to the user). */
  markRead(userId: string, id: string, readAt: number): Promise<void>;

  /** Mark all of a user's notifications read. */
  markAllRead(userId: string, readAt: number): Promise<void>;

  /** The user's per-channel prefs, or null when none exist. */
  getPrefs(userId: string): Promise<InboxChannelPrefs | null>;

  /** Whether the user has a linked Telegram chat. */
  hasTelegramLink(userId: string): Promise<boolean>;

  /** Upsert the user's prefs. Unset patch fields are left untouched on update. */
  upsertPrefs(userId: string, patch: PrefsPatch, updatedAt: number): Promise<void>;

  /** Insert a one-time Telegram start code. */
  insertTelegramLinkCode(
    code: string,
    userId: string,
    expiresAt: number,
  ): Promise<void>;

  /** Remove the user's Telegram link. */
  deleteTelegramLink(userId: string): Promise<void>;

  /** Upsert a web-push subscription keyed on its endpoint. */
  upsertWebPushSubscription(input: WebPushSubscriptionInput): Promise<void>;

  /** Delete a web-push subscription by endpoint (scoped to the user). */
  deleteWebPushSubscription(userId: string, endpoint: string): Promise<void>;

  /** Upsert a mobile-push token keyed on the token value. */
  upsertMobilePushToken(input: MobilePushTokenInput): Promise<void>;

  /** Delete a mobile-push token (scoped to the user). */
  deleteMobilePushToken(userId: string, token: string): Promise<void>;
}
