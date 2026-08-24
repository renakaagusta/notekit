/**
 * Outbound port for the durable-notification store. The emit use case depends on
 * this instead of Drizzle, so the Postgres queries live in a driven adapter.
 */
export interface NotificationRow {
  id: string;
  userId: string;
  agentSlug: string;
  eventType: string;
  resourcePath: string;
  summary: string;
  payload: string;
}

export interface NotificationChannelPrefs {
  telegramEnabled: boolean;
  webPushEnabled: boolean;
  mobilePushEnabled: boolean;
}

export interface NotificationsRepository {
  /** Generate the notification row id (`ntf_<nanoid16>`). */
  newNotificationId(): string;

  /** Persist a notification row into the durable inbox. */
  insertNotification(row: NotificationRow): Promise<void>;

  /**
   * The user's per-channel notification prefs, or null when the user has no
   * prefs row at all.
   */
  getChannelPrefs(userId: string): Promise<NotificationChannelPrefs | null>;
}
