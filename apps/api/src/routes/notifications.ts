/**
 * Notifications inbox + per-channel subscription endpoints.
 *
 * - Inbox: GET /notifications, POST /notifications/:id/read, POST /notifications/read-all
 * - Prefs: GET /notifications/prefs, PATCH /notifications/prefs
 * - Telegram link: POST /notifications/telegram/link-code, DELETE /notifications/telegram
 * - Web push: GET /notifications/web-push/key, POST /notifications/web-push/subscribe, DELETE /notifications/web-push/subscribe
 * - Mobile push: POST /notifications/mobile-push/subscribe, DELETE /notifications/mobile-push/subscribe
 */
import { Hono } from "hono";
import { and, desc, eq, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, schema } from "../db";
import { env } from "../env";
import { getCurrentUser } from "../auth/sessions";
import { parseBody, z } from "../validation";
import { emitAgentEvent } from "../notifications/emit";

export const notificationRoutes = new Hono();

if (!env.isProd) {
  notificationRoutes.post("/dev/test", async (c) => {
    const user = await getCurrentUser(c);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    emitAgentEvent({
      userId: user.id,
      agentSlug: "test-agent",
      eventType: "file.write",
      resourcePath: `notes/dev-test-${Date.now()}.md`,
      extra: { source: "dev_test_endpoint" },
    });
    return c.json({ ok: true });
  });
}

const DevicePairedBody = z.object({
  deviceId: z.string().min(1).max(128),
  deviceName: z.string().min(1).max(200),
});

/**
 * POST /notifications/device-paired — alert the user that a new E2EE device
 * joined their vault. Pairing itself is a client-side Git-vault commit the
 * server never sees, so the approving device pings this after addDevice()
 * succeeds. This is a security signal: an unexpected one means someone else
 * got a code (or the recovery phrase) approved.
 */
notificationRoutes.post("/device-paired", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, DevicePairedBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  emitAgentEvent({
    userId: user.id,
    agentSlug: "security",
    eventType: "device.paired",
    resourcePath: `.notekit/devices/${parsed.data.deviceId}.json`,
    extra: {
      deviceId: parsed.data.deviceId,
      deviceName: parsed.data.deviceName,
    },
  });
  return c.json({ ok: true });
});

/**
 * GET /notifications?limit=50&before=<id> — paginated inbox, newest first.
 */
notificationRoutes.get("/", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const limit = Math.min(Number(c.req.query("limit") ?? "50") || 50, 100);
  const before = c.req.query("before");

  let cursorTs: Date | null = null;
  if (before) {
    const cursor = await db.query.notifications.findFirst({
      where: eq(schema.notifications.id, before),
    });
    if (cursor) cursorTs = cursor.createdAt;
  }

  const where = cursorTs
    ? and(
        eq(schema.notifications.userId, user.id),
        lt(schema.notifications.createdAt, cursorTs),
      )
    : eq(schema.notifications.userId, user.id);

  const rows = await db.query.notifications.findMany({
    where,
    orderBy: [desc(schema.notifications.createdAt)],
    limit,
  });

  return c.json({
    notifications: rows.map((r) => ({
      id: r.id,
      agentSlug: r.agentSlug,
      eventType: r.eventType,
      resourcePath: r.resourcePath,
      summary: r.summary,
      payload: JSON.parse(r.payload),
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt?.toISOString() ?? null,
    })),
    nextCursor: rows.length === limit ? rows[rows.length - 1]!.id : null,
  });
});

notificationRoutes.post("/:id/read", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const id = c.req.param("id");
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.id, id),
        eq(schema.notifications.userId, user.id),
      ),
    )
    .run();
  return c.json({ ok: true });
});

notificationRoutes.post("/read-all", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(eq(schema.notifications.userId, user.id))
    .run();
  return c.json({ ok: true });
});

notificationRoutes.get("/prefs", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const prefs = await db.query.notificationPrefs.findFirst({
    where: eq(schema.notificationPrefs.userId, user.id),
  });
  const link = await db.query.telegramLinks.findFirst({
    where: eq(schema.telegramLinks.userId, user.id),
  });
  return c.json({
    prefs: {
      telegramEnabled: prefs?.telegramEnabled ?? false,
      webPushEnabled: prefs?.webPushEnabled ?? false,
      mobilePushEnabled: prefs?.mobilePushEnabled ?? false,
    },
    channels: {
      telegram: { linked: Boolean(link) },
      webPush: { configured: Boolean(env.vapid.publicKey) },
      mobilePush: {
        // Both platforms deliver via FCM now, so a single credential gates both.
        ios: Boolean(env.fcm.privateKey),
        android: Boolean(env.fcm.privateKey),
      },
    },
  });
});

const PrefsBody = z.object({
  telegramEnabled: z.boolean().optional(),
  webPushEnabled: z.boolean().optional(),
  mobilePushEnabled: z.boolean().optional(),
});

notificationRoutes.patch("/prefs", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, PrefsBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const now = new Date();
  await db
    .insert(schema.notificationPrefs)
    .values({
      userId: user.id,
      telegramEnabled: parsed.data.telegramEnabled ?? false,
      webPushEnabled: parsed.data.webPushEnabled ?? false,
      mobilePushEnabled: parsed.data.mobilePushEnabled ?? false,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.notificationPrefs.userId,
      set: {
        ...(parsed.data.telegramEnabled !== undefined && {
          telegramEnabled: parsed.data.telegramEnabled,
        }),
        ...(parsed.data.webPushEnabled !== undefined && {
          webPushEnabled: parsed.data.webPushEnabled,
        }),
        ...(parsed.data.mobilePushEnabled !== undefined && {
          mobilePushEnabled: parsed.data.mobilePushEnabled,
        }),
        updatedAt: now,
      },
    })
    .run();
  return c.json({ ok: true });
});

/**
 * Mint a one-time Telegram start code. Code lives 10 minutes.
 */
notificationRoutes.post("/telegram/link-code", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  if (!env.telegram.botToken || !env.telegram.botUsername) {
    return c.json({ error: "telegram_not_configured" }, 503);
  }
  // 8 chars, base62-ish via nanoid. Trades uniqueness for shortness — codes
  // expire in 10 minutes so collision risk is negligible.
  const code = nanoid(8);
  await db
    .insert(schema.telegramLinkCodes)
    .values({
      code,
      userId: user.id,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    })
    .run();
  return c.json({
    code,
    url: `https://t.me/${env.telegram.botUsername}?start=${code}`,
    expiresInSeconds: 600,
  });
});

notificationRoutes.delete("/telegram", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  await db
    .delete(schema.telegramLinks)
    .where(eq(schema.telegramLinks.userId, user.id))
    .run();
  await db
    .insert(schema.notificationPrefs)
    .values({
      userId: user.id,
      telegramEnabled: false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.notificationPrefs.userId,
      set: { telegramEnabled: false, updatedAt: new Date() },
    })
    .run();
  return c.json({ ok: true });
});

notificationRoutes.get("/web-push/key", async (c) => {
  if (!env.vapid.publicKey) return c.json({ error: "vapid_not_configured" }, 503);
  return c.json({ publicKey: env.vapid.publicKey });
});

const WebPushSubscribeBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

notificationRoutes.post("/web-push/subscribe", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, WebPushSubscribeBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const userAgent = c.req.header("user-agent") ?? null;
  await db
    .insert(schema.webPushSubscriptions)
    .values({
      id: `wps_${nanoid(16)}`,
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent,
    })
    .onConflictDoUpdate({
      target: schema.webPushSubscriptions.endpoint,
      set: {
        userId: user.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent,
      },
    })
    .run();
  await db
    .insert(schema.notificationPrefs)
    .values({
      userId: user.id,
      webPushEnabled: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.notificationPrefs.userId,
      set: { webPushEnabled: true, updatedAt: new Date() },
    })
    .run();
  return c.json({ ok: true });
});

notificationRoutes.delete("/web-push/subscribe", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => null)) as {
    endpoint?: string;
  } | null;
  if (!body?.endpoint) return c.json({ error: "endpoint_required" }, 400);
  await db
    .delete(schema.webPushSubscriptions)
    .where(
      and(
        eq(schema.webPushSubscriptions.userId, user.id),
        eq(schema.webPushSubscriptions.endpoint, body.endpoint),
      ),
    )
    .run();
  return c.json({ ok: true });
});

const MobileSubscribeBody = z.object({
  platform: z.enum(["ios", "android"]),
  token: z.string().min(1).max(512),
  deviceId: z.string().min(1).max(128).optional(),
});

notificationRoutes.post("/mobile-push/subscribe", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, MobileSubscribeBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  await db
    .insert(schema.mobilePushTokens)
    .values({
      id: `mpt_${nanoid(16)}`,
      userId: user.id,
      platform: parsed.data.platform,
      token: parsed.data.token,
      deviceId: parsed.data.deviceId ?? null,
    })
    .onConflictDoUpdate({
      target: schema.mobilePushTokens.token,
      set: {
        userId: user.id,
        platform: parsed.data.platform,
        deviceId: parsed.data.deviceId ?? null,
      },
    })
    .run();
  await db
    .insert(schema.notificationPrefs)
    .values({
      userId: user.id,
      mobilePushEnabled: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.notificationPrefs.userId,
      set: { mobilePushEnabled: true, updatedAt: new Date() },
    })
    .run();
  return c.json({ ok: true });
});

notificationRoutes.delete("/mobile-push/subscribe", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const body = (await c.req.json().catch(() => null)) as {
    token?: string;
  } | null;
  if (!body?.token) return c.json({ error: "token_required" }, 400);
  await db
    .delete(schema.mobilePushTokens)
    .where(
      and(
        eq(schema.mobilePushTokens.userId, user.id),
        eq(schema.mobilePushTokens.token, body.token),
      ),
    )
    .run();
  return c.json({ ok: true });
});
