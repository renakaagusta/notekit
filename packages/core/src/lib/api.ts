/**
 * apiFetch — used by every typed wrapper in this folder (vault-api.ts,
 * agents-api.ts, notifications-api.ts) to talk to the @notekit/api server
 * from the browser.
 *
 * It is a thin compatibility shim over the shared NoteKitClient transport
 * from @notekit/api-client. CLI / desktop / MCP construct their own client
 * with bearer auth; the web app uses cookies via this module.
 *
 * When the renderer is hosted inside the NoteKit Electron wrapper, the
 * preload bridge exposes `window.notekit.keychain` plus `auth.startSignIn`.
 * In that case we configure the client with bearer auth using a PAT pulled
 * from the OS keychain — same model the CLI and MCP use — instead of
 * relying on cookies that the user's external OAuth browser would set.
 *
 * Migration goal (incremental): new code should import typed methods from
 * @notekit/api-client directly (`nk.vault.listVaults()` etc.) instead of
 * calling apiFetch by hand. The wrappers in this folder will keep working
 * during the migration.
 */
import { NoteKitClient, createNoteKitClient, type NoteKitApi } from "@notekit/api-client";

function resolveApiUrl(): string {
  // Direct static access — Vite's define-plugin only substitutes the literal
  // `import.meta.env.VITE_API_URL` pattern at build time. Any indirection
  // (optional chaining, parenthesized casts, dynamic property access) defeats
  // the substitution and the prod bundle silently ships with the localhost
  // fallback. Asserted in apps/web/Dockerfile post-build so a regression
  // can't sneak past CI.
  // @ts-expect-error — Vite replaces this at build time; types don't see it.
  const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  return "http://localhost:3001";
}

export const apiUrl: string = resolveApiUrl();

// ── Desktop bearer-token wiring ──────────────────────────────────────────
//
// The preload bridge shape we care about. Typed minimally here so this file
// stays browser-only and doesn't import Electron types.

interface DesktopKeychainBridge {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<boolean>;
}

interface DesktopAuthBridge {
  startSignIn(
    provider: "github" | "google",
  ): Promise<{ ok: boolean; error?: string }>;
}

interface DesktopBridge {
  keychain?: DesktopKeychainBridge;
  auth?: DesktopAuthBridge;
}

function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { notekit?: DesktopBridge };
  if (!w.notekit) return null;
  return w.notekit;
}

export const isDesktop: boolean = !!getDesktopBridge()?.keychain;

let desktopToken: string | null = null;
let desktopAuthLoadPromise: Promise<void> | null = null;

/**
 * Block-on-first-call so the very first apiFetch from the renderer has
 * the keychain-resident PAT in hand. After this resolves, the bearer
 * `getToken` closure picks up whatever's in `desktopToken` without further
 * coordination.
 */
export function ensureDesktopAuthLoaded(): Promise<void> {
  if (!isDesktop) return Promise.resolve();
  if (desktopAuthLoadPromise) return desktopAuthLoadPromise;
  const bridge = getDesktopBridge();
  if (!bridge?.keychain) return Promise.resolve();
  desktopAuthLoadPromise = (async () => {
    try {
      desktopToken = await bridge.keychain!.get("token");
    } catch (err) {
      console.warn("[api] failed to read desktop token from keychain", err);
      desktopToken = null;
    }
  })();
  return desktopAuthLoadPromise;
}

/**
 * Drive the Electron sign-in flow. Resolves to true on success (the token
 * is now in the OS keychain and the main process will reload the window),
 * false otherwise. Web callers should use the cookie redirect instead.
 */
export async function startDesktopSignIn(
  provider: "github" | "google",
): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.auth) return false;
  const res = await bridge.auth.startSignIn(provider);
  return res.ok;
}

/**
 * Wipe the desktop bearer token. Called from the sign-out path so a
 * subsequent reload comes up anonymous.
 */
export async function clearDesktopToken(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.keychain) return;
  try {
    await bridge.keychain.delete("token");
  } finally {
    desktopToken = null;
    desktopAuthLoadPromise = null;
  }
}

// ── E2E (Capacitor native) PAT bootstrap ─────────────────────────────────
//
// Cookies in a Capacitor WebView aren't shared with notekit.stackbase.id
// (different origin from `capacitor://`), so OAuth-in-webview would be the
// only path to a session — and that's brittle for Maestro automation.
//
// As an escape hatch for E2E and for power users, the mobile client honors
// a PAT stashed in localStorage under `notekit:e2e-pat`. Maestro injects it
// via `runScript` before the app boots; future a PAT-paste UI could write
// to the same key. Gated to native so the web build can't pick it up by
// accident (which would replace cookies with a less-revocable bearer).
const E2E_PAT_KEY = "notekit:e2e-pat";

function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

function readMobilePat(): string {
  if (!isCapacitorNative()) return "";
  try {
    return localStorage.getItem(E2E_PAT_KEY) ?? "";
  } catch {
    return "";
  }
}

const hasMobilePat = readMobilePat().length > 0;

/**
 * The typed API client. New components should use this directly:
 *
 *     import { nk } from "../lib/api";
 *     const { tokens } = await nk.auth.listTokens();
 *
 * Falls back to `apiFetch` (defined below) only for legacy callers in this
 * folder's *-api.ts wrappers — those still work but should migrate.
 */
export const nk: NoteKitApi = createNoteKitClient({
  baseUrl: apiUrl,
  auth: isDesktop
    ? { mode: "bearer", getToken: () => desktopToken ?? "" }
    : hasMobilePat
      ? { mode: "bearer", getToken: () => readMobilePat() }
      : { mode: "cookie" },
});

const client: NoteKitClient = nk.client;

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Backwards-compatible signature: callers pass a Fetch-style `RequestInit`
 * with a JSON string body, we translate it into the transport's typed form.
 * FormData payloads (rare) fall back to a direct fetch so we don't lose the
 * multipart boundary.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase() as Method;

  if (init.body instanceof FormData) {
    const res = await fetch(`${apiUrl}${path}`, {
      credentials: "include",
      ...init,
    });
    if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }

  // All existing *-api.ts wrappers in this folder pass JSON-stringified
  // bodies. A non-JSON string body would have been double-encoded by the
  // transport's JSON.stringify call below — throw early so a future caller
  // that forgets to stringify gets a clear error instead of a silently
  // malformed wire payload.
  let body: unknown;
  if (typeof init.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch (err) {
      throw new TypeError(
        `apiFetch: string body must be JSON-encoded (got: ${init.body.slice(0, 40)}...): ${(err as Error).message}`,
      );
    }
  } else if (init.body !== undefined && init.body !== null) {
    body = init.body;
  }

  return client.request<T>(path, { method, body });
}
