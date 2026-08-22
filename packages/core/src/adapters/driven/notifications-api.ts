/**
 * Notifications + IAP client helpers.
 */
import { apiFetch } from "./api";

export interface NotificationItem {
  id: string;
  agentSlug: string;
  eventType: string;
  resourcePath: string | null;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPrefs {
  telegramEnabled: boolean;
  webPushEnabled: boolean;
  mobilePushEnabled: boolean;
}

export interface NotificationStatus {
  prefs: NotificationPrefs;
  channels: {
    telegram: { linked: boolean };
    webPush: { configured: boolean };
    mobilePush: { ios: boolean; android: boolean };
  };
}

export async function listNotifications(
  limit = 50,
  before?: string,
): Promise<{
  notifications: NotificationItem[];
  nextCursor: string | null;
}> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set("before", before);
  return apiFetch(`/notifications?${params.toString()}`);
}

export async function markRead(id: string): Promise<void> {
  await apiFetch(`/notifications/${id}/read`, { method: "POST" });
}

export async function markAllRead(): Promise<void> {
  await apiFetch(`/notifications/read-all`, { method: "POST" });
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  return apiFetch(`/notifications/prefs`);
}

export async function updatePrefs(
  prefs: Partial<NotificationPrefs>,
): Promise<void> {
  await apiFetch(`/notifications/prefs`, {
    method: "PATCH",
    body: JSON.stringify(prefs),
  });
}

export async function createTelegramLinkCode(): Promise<{
  code: string;
  url: string;
  expiresInSeconds: number;
}> {
  return apiFetch(`/notifications/telegram/link-code`, { method: "POST" });
}

export async function unlinkTelegram(): Promise<void> {
  await apiFetch(`/notifications/telegram`, { method: "DELETE" });
}

/**
 * Alert the user that a new device joined their encrypted vault. Best-effort:
 * pairing already succeeded by the time this is called, so a failure here must
 * never surface as a pairing error.
 */
export async function notifyDevicePaired(
  deviceId: string,
  deviceName: string,
): Promise<void> {
  await apiFetch(`/notifications/device-paired`, {
    method: "POST",
    body: JSON.stringify({ deviceId, deviceName }),
  });
}

export interface Entitlement {
  plus: boolean;
  plusUntil: string | null;
  plusSource: "apple" | "google" | "stripe" | "lifetime" | null;
  softLimits: { mobileFreeNotes: number };
}

export async function getEntitlement(): Promise<Entitlement> {
  return apiFetch(`/iap/entitlement`);
}
