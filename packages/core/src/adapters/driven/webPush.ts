/**
 * Client-side Web Push helpers. Registers the service worker, asks for
 * permission, subscribes to push, and posts the subscription to our API.
 *
 * Idempotent: calling subscribe() while already subscribed re-POSTs the same
 * subscription, which the API upserts on `endpoint`.
 */
import { apiUrl } from "./api";

export type WebPushSupport =
  | { supported: true }
  | { supported: false; reason: string };

export function checkWebPushSupport(): WebPushSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "no_window" };
  }
  if (!("serviceWorker" in navigator)) {
    return { supported: false, reason: "no_service_worker" };
  }
  if (!("PushManager" in window)) {
    return { supported: false, reason: "no_push_manager" };
  }
  if (!("Notification" in window)) {
    return { supported: false, reason: "no_notification" };
  }
  return { supported: true };
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribeWebPush(): Promise<void> {
  const support = checkWebPushSupport();
  if (!support.supported) throw new Error(support.reason);

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("permission_denied");

  const keyRes = await fetch(`${apiUrl}/notifications/web-push/key`, {
    credentials: "include",
  });
  if (!keyRes.ok) throw new Error(`vapid_key_${keyRes.status}`);
  const { publicKey } = (await keyRes.json()) as { publicKey: string };

  const reg = await ensureRegistration();
  const existing = await reg.pushManager.getSubscription();
  // ArrayBuffer slice is what `applicationServerKey` formally accepts; pass
  // the underlying buffer to satisfy strict DOM lib types.
  const keyBytes = urlBase64ToUint8Array(publicKey);
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes.buffer.slice(
        keyBytes.byteOffset,
        keyBytes.byteOffset + keyBytes.byteLength,
      ) as ArrayBuffer,
    }));

  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("subscription_missing_fields");
  }

  const subRes = await fetch(`${apiUrl}/notifications/web-push/subscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
  if (!subRes.ok) throw new Error(`subscribe_${subRes.status}`);
}

export async function unsubscribeWebPush(): Promise<void> {
  const support = checkWebPushSupport();
  if (!support.supported) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch(`${apiUrl}/notifications/web-push/subscribe`, {
    method: "DELETE",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

export async function isWebPushSubscribed(): Promise<boolean> {
  const support = checkWebPushSupport();
  if (!support.supported) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return Boolean(sub);
}
