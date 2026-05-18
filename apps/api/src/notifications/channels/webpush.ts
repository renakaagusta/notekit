/**
 * Web Push channel. Uses the `web-push` lib with VAPID. M3 wires this in.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { env } from "../../env";

type WebPushModule = {
  setVapidDetails: (subject: string, pub: string, priv: string) => void;
  sendNotification: (
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>;
};

let webPushPromise: Promise<WebPushModule | null> | null = null;
function loadWebPush(): Promise<WebPushModule | null> {
  if (webPushPromise) return webPushPromise;
  webPushPromise = (async () => {
    if (
      !env.vapid.publicKey ||
      !env.vapid.privateKey ||
      !env.vapid.subject
    ) {
      return null;
    }
    try {
      const mod = (await import("web-push")) as unknown as {
        default: WebPushModule;
      };
      const lib = mod.default;
      lib.setVapidDetails(
        env.vapid.subject,
        env.vapid.publicKey,
        env.vapid.privateKey,
      );
      return lib;
    } catch (err) {
      console.warn(
        "[notify:webpush] web-push module not installed; skipping. Run `pnpm add web-push @types/web-push` in apps/api.",
        err,
      );
      return null;
    }
  })();
  return webPushPromise;
}

export async function sendWebPush(
  userId: string,
  summary: string,
  notificationId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const lib = await loadWebPush();
  if (!lib) return;
  const subs = await db.query.webPushSubscriptions.findMany({
    where: eq(schema.webPushSubscriptions.userId, userId),
  });
  if (subs.length === 0) return;

  const body = JSON.stringify({
    title: "NoteKit",
    body: summary,
    notificationId,
    data: payload,
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await lib.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(schema.webPushSubscriptions)
            .where(eq(schema.webPushSubscriptions.id, s.id))
            .run();
        } else {
          console.error("[notify:webpush] send failed:", err);
        }
      }
    }),
  );
}
