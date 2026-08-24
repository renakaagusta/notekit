import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { NotificationsRepository } from "../../../application/ports/out/NotificationsRepository";
import { db, schema } from "../db";

/** Drizzle/Postgres implementation of {@link NotificationsRepository}. */
export const notificationsRepository: NotificationsRepository = {
  newNotificationId() {
    return `ntf_${nanoid(16)}`;
  },
  async insertNotification(row) {
    await db.insert(schema.notifications).values(row).execute();
  },
  async getChannelPrefs(userId) {
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
};
