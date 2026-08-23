import type { NotificationsService } from "../ports/in/NotificationsService";
import type { NotificationsPort } from "../ports/out/NotificationsPort";

/**
 * Use case implementing {@link NotificationsService}: delegates each operation
 * to the injected {@link NotificationsPort}. The UI depends on this inbound
 * capability, which depends only on the outbound port — the notifications
 * transport is swappable.
 */
export function createNotificationsService(
  notifications: NotificationsPort,
): NotificationsService {
  return {
    listNotifications: (limit, before) =>
      notifications.listNotifications(limit, before),
    markRead: (id) => notifications.markRead(id),
    markAllRead: () => notifications.markAllRead(),
    getNotificationStatus: () => notifications.getNotificationStatus(),
    updatePrefs: (prefs) => notifications.updatePrefs(prefs),
    createTelegramLinkCode: () => notifications.createTelegramLinkCode(),
    unlinkTelegram: () => notifications.unlinkTelegram(),
    notifyDevicePaired: (deviceId, deviceName) =>
      notifications.notifyDevicePaired(deviceId, deviceName),
    getEntitlement: () => notifications.getEntitlement(),
  };
}
