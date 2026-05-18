/**
 * Mobile push registration (iOS APNs / Android FCM via Capacitor).
 *
 * Dynamically imports `@capacitor/push-notifications` so the web bundle
 * doesn't require it. The native shell installs the module; the web build
 * fails soft when not present.
 */
import { apiUrl } from "./api";
import { getNativePlatform, isNativePlatform } from "./native";

interface PushPluginToken {
  value: string;
}

interface PushPlugin {
  requestPermissions: () => Promise<{ receive: "granted" | "denied" | "prompt" }>;
  register: () => Promise<void>;
  addListener: (
    event: "registration" | "registrationError" | "pushNotificationReceived" | "pushNotificationActionPerformed",
    cb: (data: unknown) => void,
  ) => Promise<{ remove: () => Promise<void> }>;
  removeAllListeners: () => Promise<void>;
}

async function loadPushPlugin(): Promise<PushPlugin | null> {
  if (!isNativePlatform()) return null;
  try {
    // Resolved dynamically at runtime in the Capacitor build; the web build
    // never reaches here. Variable specifier hides the missing module from
    // the bundler + TS resolver.
    const moduleName = "@capacitor/push-notifications";
    const mod = (await import(/* @vite-ignore */ moduleName)) as {
      PushNotifications: PushPlugin;
    };
    return mod.PushNotifications;
  } catch {
    return null;
  }
}

/**
 * Ask for permission, register with APNs/FCM, send the token to our API.
 * Resolves when the token has been POSTed. Rejects on denial or plugin
 * absence.
 */
export async function subscribeMobilePush(): Promise<void> {
  const plugin = await loadPushPlugin();
  if (!plugin) throw new Error("not_native");

  const perm = await plugin.requestPermissions();
  if (perm.receive !== "granted") throw new Error("permission_denied");

  const platform = getNativePlatform();
  if (platform !== "ios" && platform !== "android") {
    throw new Error("unsupported_platform");
  }

  const tokenPromise = new Promise<string>((resolve, reject) => {
    let resolved = false;
    void plugin.addListener("registration", (data) => {
      if (resolved) return;
      resolved = true;
      const t = (data as PushPluginToken).value;
      if (t) resolve(t);
      else reject(new Error("empty_token"));
    });
    void plugin.addListener("registrationError", (err) => {
      if (resolved) return;
      resolved = true;
      reject(new Error(`registration_error: ${JSON.stringify(err)}`));
    });
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      reject(new Error("registration_timeout"));
    }, 30_000);
  });

  await plugin.register();
  const token = await tokenPromise;

  const res = await fetch(`${apiUrl}/notifications/mobile-push/subscribe`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platform, token }),
  });
  if (!res.ok) throw new Error(`subscribe_${res.status}`);
}

export async function unsubscribeMobilePush(token: string): Promise<void> {
  await fetch(`${apiUrl}/notifications/mobile-push/subscribe`, {
    method: "DELETE",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
}
