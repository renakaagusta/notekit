import { and, desc, eq, lt } from "drizzle-orm";
import type {
  InboxChannelPrefs,
  InboxNotificationRow,
  MobilePushTokenInput,
  NotificationsInboxRepository,
  PrefsPatch,
  WebPushSubscriptionInput,
} from "../../../application/ports/out/NotificationsInboxRepository";
import { db, schema } from ".";

/** Drizzle/Postgres implementation of {@link NotificationsInboxRepository}. */
export const notificationsInboxRepository: NotificationsInboxRepository = {
  async getNotificationCreatedAt(id: string): Promise<number | null> {
    const cursor = await db.query.notifications.findFirst({
      where: eq(schema.notifications.id, id),
    });
    return cursor ? cursor.createdAt : null;
  },

  async listNotifications(
    userId: string,
    cursorTs: number | null,
    limit: number,
  ): Promise<InboxNotificationRow[]> {
    const where = cursorTs
      ? and(
          eq(schema.notifications.userId, userId),
          lt(schema.notifications.createdAt, cursorTs),
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

  async markRead(userId: string, id: string, readAt: number): Promise<void> {
    await db
      .update(schema.notifications)
      .set({ readAt })
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.userId, userId),
        ),
      )
      .execute();
  },

  async markAllRead(userId: string, readAt: number): Promise<void> {
    await db
      .update(schema.notifications)
      .set({ readAt })
      .where(eq(schema.notifications.userId, userId))
      .execute();
  },

  async getPrefs(userId: string): Promise<InboxChannelPrefs | null> {
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

  async hasTelegramLink(userId: string): Promise<boolean> {
    const link = await db.query.telegramLinks.findFirst({
      where: eq(schema.telegramLinks.userId, userId),
    });
    return Boolean(link);
  },

  async upsertPrefs(
    userId: string,
    patch: PrefsPatch,
    updatedAt: number,
  ): Promise<void> {
    await db
      .insert(schema.notificationPrefs)
      .values({
        userId,
        ...(patch.telegramEnabled !== undefined && {
          telegramEnabled: patch.telegramEnabled,
        }),
        ...(patch.webPushEnabled !== undefined && {
          webPushEnabled: patch.webPushEnabled,
        }),
        ...(patch.mobilePushEnabled !== undefined && {
          mobilePushEnabled: patch.mobilePushEnabled,
        }),
        updatedAt,
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
          updatedAt,
        },
      })
      .execute();
  },

  async insertTelegramLinkCode(
    code: string,
    userId: string,
    expiresAt: number,
  ): Promise<void> {
    await db
      .insert(schema.telegramLinkCodes)
      .values({ code, userId, expiresAt })
      .execute();
  },

  async deleteTelegramLink(userId: string): Promise<void> {
    await db
      .delete(schema.telegramLinks)
      .where(eq(schema.telegramLinks.userId, userId))
      .execute();
  },

  async upsertWebPushSubscription(input: WebPushSubscriptionInput): Promise<void> {
    await db
      .insert(schema.webPushSubscriptions)
      .values({
        id: input.id,
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
      })
      .onConflictDoUpdate({
        target: schema.webPushSubscriptions.endpoint,
        set: {
          userId: input.userId,
          p256dh: input.p256dh,
          auth: input.auth,
          userAgent: input.userAgent,
        },
      })
      .execute();
  },

  async deleteWebPushSubscription(userId: string, endpoint: string): Promise<void> {
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

  async upsertMobilePushToken(input: MobilePushTokenInput): Promise<void> {
    await db
      .insert(schema.mobilePushTokens)
      .values({
        id: input.id,
        userId: input.userId,
        platform: input.platform,
        token: input.token,
        deviceId: input.deviceId,
      })
      .onConflictDoUpdate({
        target: schema.mobilePushTokens.token,
        set: {
          userId: input.userId,
          platform: input.platform,
          deviceId: input.deviceId,
        },
      })
      .execute();
  },

  async deleteMobilePushToken(userId: string, token: string): Promise<void> {
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
