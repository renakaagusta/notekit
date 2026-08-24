import { and, desc, eq, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { NotificationsInboxRepository } from "../../../application/ports/out/NotificationsInboxRepository";
import { db, schema } from ".";

/** Drizzle/Postgres implementation of {@link NotificationsInboxRepository}. */
export const notificationsInboxRepository: NotificationsInboxRepository = {
  async getCursorCreatedAt(id) {
    const cursor = await db.query.notifications.findFirst({
      where: eq(schema.notifications.id, id),
    });
    return cursor?.createdAt ?? null;
  },

  async listNotifications(userId, limit, beforeCreatedAt) {
    const where = beforeCreatedAt
      ? and(
          eq(schema.notifications.userId, userId),
          lt(schema.notifications.createdAt, beforeCreatedAt),
        )
      : eq(schema.notifications.userId, userId);
    const rows = await db.query.notifications.findMany({
      where,
      orderBy: [desc(schema.notifications.createdAt)],
      limit,
    });
    return rows.map((r) => ({
      id: r.id,
      agentSlug: r.agentSlug,
      eventType: r.eventType,
      resourcePath: r.resourcePath,
      summary: r.summary,
      payload: r.payload,
      createdAt: r.createdAt,
      readAt: r.readAt,
    }));
  },

  async markRead(userId, id) {
    await db
      .update(schema.notifications)
      .set({ readAt: Date.now() })
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.userId, userId),
        ),
      )
      .execute();
  },

  async markAllRead(userId) {
    await db
      .update(schema.notifications)
      .set({ readAt: Date.now() })
      .where(eq(schema.notifications.userId, userId))
      .execute();
  },

  async getPrefs(userId) {
    const prefs = await db.query.notificationPrefs.findFirst({
      where: eq(schema.notificationPrefs.userId, userId),
    });
    if (!prefs) return null;
    return {
      telegramEnabled: prefs.telegramEnabled,
      webPushEnabled: prefs.webPushEnabled,
      mobilePushEnabled: prefs.mobilePushEnabled,
    };
  },

  async isTelegramLinked(userId) {
    const link = await db.query.telegramLinks.findFirst({
      where: eq(schema.telegramLinks.userId, userId),
    });
    return Boolean(link);
  },

  async upsertPrefs(userId, patch) {
    const now = Date.now();
    await db
      .insert(schema.notificationPrefs)
      .values({
        userId,
        telegramEnabled: patch.telegramEnabled ?? false,
        webPushEnabled: patch.webPushEnabled ?? false,
        mobilePushEnabled: patch.mobilePushEnabled ?? false,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.notificationPrefs.userId,
        set: {
          ...(patch.telegramEnabled !== undefined && {
            telegramEnabled: patch.telegramEnabled,
          }),
          ...(patch.webPushEnabled !== undefined && {
            webPushEnabled: patch.webPushEnabled,
          }),
          ...(patch.mobilePushEnabled !== undefined && {
            mobilePushEnabled: patch.mobilePushEnabled,
          }),
          updatedAt: now,
        },
      })
      .execute();
  },

  async insertTelegramLinkCode(code, userId, expiresAt) {
    await db
      .insert(schema.telegramLinkCodes)
      .values({ code, userId, expiresAt })
      .execute();
  },

  async unlinkTelegram(userId) {
    await db
      .delete(schema.telegramLinks)
      .where(eq(schema.telegramLinks.userId, userId))
      .execute();
    await db
      .insert(schema.notificationPrefs)
      .values({
        userId,
        telegramEnabled: false,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: schema.notificationPrefs.userId,
        set: { telegramEnabled: false, updatedAt: Date.now() },
      })
      .execute();
  },

  async subscribeWebPush(userId, sub) {
    await db
      .insert(schema.webPushSubscriptions)
      .values({
        id: `wps_${nanoid(16)}`,
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        userAgent: sub.userAgent,
      })
      .onConflictDoUpdate({
        target: schema.webPushSubscriptions.endpoint,
        set: {
          userId,
          p256dh: sub.p256dh,
          auth: sub.auth,
          userAgent: sub.userAgent,
        },
      })
      .execute();
    await db
      .insert(schema.notificationPrefs)
      .values({
        userId,
        webPushEnabled: true,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: schema.notificationPrefs.userId,
        set: { webPushEnabled: true, updatedAt: Date.now() },
      })
      .execute();
  },

  async unsubscribeWebPush(userId, endpoint) {
    await db
      .delete(schema.webPushSubscriptions)
      .where(
        and(
          eq(schema.webPushSubscriptions.userId, userId),
          eq(schema.webPushSubscriptions.endpoint, endpoint),
        ),
      )
      .execute();
  },

  async subscribeMobilePush(userId, sub) {
    await db
      .insert(schema.mobilePushTokens)
      .values({
        id: `mpt_${nanoid(16)}`,
        userId,
        platform: sub.platform,
        token: sub.token,
        deviceId: sub.deviceId,
      })
      .onConflictDoUpdate({
        target: schema.mobilePushTokens.token,
        set: {
          userId,
          platform: sub.platform,
          deviceId: sub.deviceId,
        },
      })
      .execute();
    await db
      .insert(schema.notificationPrefs)
      .values({
        userId,
        mobilePushEnabled: true,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: schema.notificationPrefs.userId,
        set: { mobilePushEnabled: true, updatedAt: Date.now() },
      })
      .execute();
  },

  async unsubscribeMobilePush(userId, token) {
    await db
      .delete(schema.mobilePushTokens)
      .where(
        and(
          eq(schema.mobilePushTokens.userId, userId),
          eq(schema.mobilePushTokens.token, token),
        ),
      )
      .execute();
  },
};
