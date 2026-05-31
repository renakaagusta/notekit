/**
 * Native (Capacitor) Google / GitHub sign-in via a custom-URL-scheme deep
 * link.
 *
 * The plain web redirect flow (`window.location.href = /auth/google`) breaks
 * on native: the OAuth dance runs in an in-app Safari that doesn't share
 * cookie storage with the app's WKWebView, so the session cookie the server
 * sets never reaches the app. Instead we:
 *
 *   1. Open `/auth/<provider>?mode=native` in the in-app browser.
 *   2. The server completes OAuth, mints a PAT, and redirects to
 *      `notekit://auth-callback?token=…` (see apps/api auth.ts).
 *   3. iOS/Android hand that custom-scheme URL to the app via the
 *      `appUrlOpen` event; we stash the PAT where the api-client's mobile
 *      bearer mode reads it, close the browser, and reload.
 *
 * Plugins are reached through the global `Capacitor.Plugins` rather than
 * `import("@capacitor/...")` — that dynamic import hangs forever under the
 * `capacitor://localhost` scheme on iOS 16 (same trap as apple-signin.ts).
 */
import { apiUrl } from "./api";
import { isNativePlatform } from "./native";

const PAT_KEY = "notekit:e2e-pat";

interface BrowserPlugin {
  open(options: { url: string }): Promise<void>;
  close(): Promise<void>;
}
interface AppPlugin {
  addListener(
    event: "appUrlOpen",
    cb: (data: { url: string }) => void,
  ): Promise<unknown> | unknown;
}
interface CapacitorGlobal {
  Plugins?: { Browser?: BrowserPlugin; App?: AppPlugin };
}

function plugins(): CapacitorGlobal["Plugins"] | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.Plugins ?? null;
}

/**
 * Open the provider's OAuth start URL in the in-app browser, tagged so the
 * server returns a PAT via the custom scheme. Resolves once the browser is
 * presented; the actual sign-in completes asynchronously via the deep-link
 * listener below.
 */
export async function startNativeOAuth(
  provider: "github" | "google",
): Promise<void> {
  const browser = plugins()?.Browser;
  const url = `${apiUrl}/auth/${provider}?mode=native`;
  if (browser) {
    await browser.open({ url });
  } else {
    // No Browser plugin (shouldn't happen on native) — fall back to a plain
    // navigation so the flow at least starts.
    window.location.href = url;
  }
}

let deepLinkBound = false;

/**
 * Register the one-time `appUrlOpen` listener that catches the OAuth
 * callback deep link, stores the PAT, and reloads into the signed-in app.
 * Safe to call on every platform — no-ops off native or if already bound.
 */
export function initNativeAuthDeepLink(): void {
  if (deepLinkBound) return;
  if (!isNativePlatform()) return;
  const app = plugins()?.App;
  if (!app) return;
  deepLinkBound = true;

  void app.addListener("appUrlOpen", ({ url }) => {
    if (!url || !url.startsWith("notekit://auth-callback")) return;
    let token: string | null = null;
    let error: string | null = null;
    try {
      const parsed = new URL(url);
      token = parsed.searchParams.get("token");
      error = parsed.searchParams.get("error");
    } catch {
      /* malformed deep link — ignore */
    }

    // Dismiss the in-app browser regardless of outcome so the user lands
    // back in the app rather than staring at a closed OAuth page.
    void plugins()?.Browser?.close?.();

    if (token) {
      try {
        localStorage.setItem(PAT_KEY, token);
      } catch {
        /* storage blocked — nothing more we can do */
      }
      window.location.reload();
    } else if (error) {
      console.warn("[auth/native] OAuth callback returned error:", error);
    }
  });
}
