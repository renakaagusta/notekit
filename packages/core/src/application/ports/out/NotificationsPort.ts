import type {
  Entitlement,
  NotificationItem,
  NotificationPrefs,
  NotificationStatus,
} from "../../../domain/entities/notification";

/**
 * Outbound port for the notifications + IAP REST surface. The notifications use
 * case depends on this rather than the concrete `notifications-api` transport,
 * so the backend call shape stays behind the composition root.
 */
export interface NotificationsPort {
  listNotifications(
    limit?: number,
    before?: string,
  ): Promise<{ notifications: NotificationItem[]; nextCursor: string | null }>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  getNotificationStatus(): Promise<NotificationStatus>;
  updatePrefs(prefs: Partial<NotificationPrefs>): Promise<void>;
  createTelegramLinkCode(): Promise<{
    code: string;
    url: string;
    expiresInSeconds: number;
  }>;
  unlinkTelegram(): Promise<void>;
  notifyDevicePaired(deviceId: string, deviceName: string): Promise<void>;
  getEntitlement(): Promise<Entitlement>;
}
