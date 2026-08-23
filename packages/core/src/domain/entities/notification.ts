/**
 * Pure data shapes for the notifications + IAP entitlement surface. These are
 * plain records with no behaviour, so they live in the domain and are shared by
 * the outbound port, the transport adapter, and the driving UI.
 */

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

export interface Entitlement {
  plus: boolean;
  plusUntil: string | null;
  plusSource: "apple" | "google" | "stripe" | "lifetime" | null;
  softLimits: { mobileFreeNotes: number };
}
