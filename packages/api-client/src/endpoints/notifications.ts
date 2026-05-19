// Notifications inbox, prefs, push subscriptions, Telegram linking. Mirrors
// apps/api/src/routes/notifications.ts and packages/core/src/lib/
// notifications-api.ts.

import type { NoteKitClient } from "../transport";
import type { NotificationItem, NotificationPrefs, NotificationStatus } from "../types";

export function notificationEndpoints(client: NoteKitClient) {
  return {
    // ── inbox ────────────────────────────────────────────────────────────
    async list(opts: { limit?: number; before?: string } = {}): Promise<{
      notifications: NotificationItem[];
      nextCursor: string | null;
    }> {
      return client.request("/notifications", {
        query: { limit: opts.limit ?? 50, before: opts.before },
      });
    },
    async markRead(id: string): Promise<void> {
      await client.request(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
    },
    async markAllRead(): Promise<void> {
      await client.request("/notifications/read-all", { method: "POST" });
    },

    // ── prefs ────────────────────────────────────────────────────────────
    async getStatus(): Promise<NotificationStatus> {
      return client.request<NotificationStatus>("/notifications/prefs");
    },
    async updatePrefs(prefs: Partial<NotificationPrefs>): Promise<void> {
      await client.request("/notifications/prefs", { method: "PATCH", body: prefs });
    },

    // ── telegram ─────────────────────────────────────────────────────────
    async createTelegramLinkCode(): Promise<{
      code: string;
      url: string;
      expiresInSeconds: number;
    }> {
      return client.request("/notifications/telegram/link-code", { method: "POST" });
    },
    async unlinkTelegram(): Promise<void> {
      await client.request("/notifications/telegram", { method: "DELETE" });
    },

    // ── web push (browser) ───────────────────────────────────────────────
    async getWebPushKey(): Promise<{ publicKey: string }> {
      return client.request("/notifications/web-push/key");
    },
    async subscribeWebPush(sub: PushSubscriptionJSON): Promise<void> {
      await client.request("/notifications/web-push/subscribe", { method: "POST", body: sub });
    },
    async unsubscribeWebPush(): Promise<void> {
      await client.request("/notifications/web-push/subscribe", { method: "DELETE" });
    },

    // ── mobile push (Capacitor) ──────────────────────────────────────────
    async subscribeMobilePush(input: { token: string; platform: "ios" | "android" }): Promise<void> {
      await client.request("/notifications/mobile-push/subscribe", { method: "POST", body: input });
    },
    async unsubscribeMobilePush(token: string): Promise<void> {
      await client.request("/notifications/mobile-push/subscribe", {
        method: "DELETE",
        body: { token },
      });
    },
  };
}
