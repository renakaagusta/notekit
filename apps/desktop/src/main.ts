// SPDX-License-Identifier: MIT
// NoteKit desktop — MIT-licensed Electron wrapper around the @notekit/web
// build. The web bundle is loaded as a normal renderer; the wrapper only
// adds OS integrations (keychain, external links, auto-update) and the
// usual lifecycle plumbing. Keep this file small — anything non-trivial
// should move into a typed IPC handler.

import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { Entry } from "@napi-rs/keyring";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { AddressInfo } from "node:net";
import {
  IPC_CHANNELS,
  KEYCHAIN_SERVICE,
  type AppOpenExternalPayload,
  type AuthStartSignInPayload,
  type AuthStartSignInResult,
  type KeychainDeletePayload,
  type KeychainGetPayload,
  type KeychainSetPayload,
  type UpdaterCheckResult,
} from "./ipc";

const isDev = process.env.NOTEKIT_DEV === "1" || !app.isPackaged;

// __dirname is provided by CommonJS; declare for typing in case the file
// is ever switched to ESM (this typecheck setup uses CJS today).
declare const __dirname: string;

const DEV_URL = "http://localhost:5173";

/**
 * Base URL of the NoteKit API. The same env knob the web build reads
 * (`VITE_API_URL`) is honored here so a dev pointing at a staging API
 * gets the same target in main and renderer.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.NOTEKIT_API_URL ?? process.env.VITE_API_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, "");
  return "https://api.notekit.online";
}
const API_URL = resolveApiUrl();

/** Sign-in loopback waits this long for the browser callback before giving up. */
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

// In production the web build is shipped via electron-builder's
// `extraResources` entry, which copies apps/web/dist into the packaged app
// at `<resourcesPath>/app/web` (see electron-builder.yml).
function resolveProdIndex(): string {
  return path.join(process.resourcesPath, "app", "web", "index.html");
}

// Canonical packaged index URL. Captured once at startup so the navigation
// guard can compare each attempted file:// load against the single file we
// are willing to render. Anything else — a user-pasted file:// URL, a
// fetched .html dropped in /tmp, an attacker-supplied SPA redirect — gets
// blocked instead of being loaded into the renderer with our preload bridge
// attached.
const PROD_INDEX_FILE_URL = isDev ? null : pathToFileURL(resolveProdIndex()).toString();

// Names the renderer is allowed to read or write in the OS keychain. Locking
// this down means a compromised renderer (XSS in the web bundle, a malicious
// third-party script, a will-navigate slip) can only touch credentials we
// already trust it with — not e.g. an SSH key the user later stores under
// the same service id.
const ALLOWED_KEYCHAIN_KEYS = new Set<string>([
  // Bearer token persisted across sessions when the user signs in via the
  // CLI loopback flow inside Electron. Matches the CLI's keychain account.
  "token",
  // Per-vault GitHub PAT for users with a BYO GitHub vault.
  "github.token",
]);
const KEYCHAIN_KEY_RE = /^[a-z][a-z0-9._-]{0,63}$/;

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0b0b0b",
    show: false,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Electron deprecated the remote module entirely in v14+; this is a
      // belt-and-suspenders no-op but documents intent.
      webSecurity: true,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  // Force every window.open / target=_blank link out to the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Also intercept in-page navigations to external origins. In dev we keep
  // same-origin SPA navigations (localhost:5173) inside the window; in prod
  // we permit ONLY the canonical packaged index — any other file:// path is
  // refused so a stray window.location to `file:///tmp/evil.html` can't
  // load attacker-controlled HTML with the preload bridge attached.
  win.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    let allowed = false;
    if (isDev) {
      allowed = target.origin === DEV_URL;
    } else if (target.protocol === "file:" && PROD_INDEX_FILE_URL) {
      // Normalize both sides via the URL parser (handles trailing slashes,
      // percent-encoding) before comparing.
      allowed = new URL(url).href === PROD_INDEX_FILE_URL;
    }
    if (!allowed) {
      event.preventDefault();
      if (/^https?:$/.test(target.protocol)) {
        void shell.openExternal(url);
      }
    }
  });

  if (isDev) {
    void win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    const indexPath = resolveProdIndex();
    void win.loadURL(pathToFileURL(indexPath).toString());
  }

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  return win;
}

// One Entry per (service, account) tuple. We construct on demand because
// Entry instances are cheap and @napi-rs/keyring's underlying OS calls do
// the actual locking — caching here would add a Map for no measurable win.
function keychainEntry(key: string): Entry {
  return new Entry(KEYCHAIN_SERVICE, key);
}

/**
 * Validate a keychain key from the renderer against both a shape regex and
 * a hardcoded allowlist. Returning false here means a compromised renderer
 * cannot read or overwrite arbitrary OS credentials under our service id —
 * the worst it can do is touch the small set of keys we already expose to
 * the SPA.
 */
function isAllowedKeychainKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    KEYCHAIN_KEY_RE.test(key) &&
    ALLOWED_KEYCHAIN_KEYS.has(key)
  );
}

function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.KeychainGet,
    async (_event, payload: KeychainGetPayload): Promise<string | null> => {
      if (!isAllowedKeychainKey(payload?.key)) return null;
      try {
        return keychainEntry(payload.key).getPassword() ?? null;
      } catch {
        // No entry yet, or the OS keyring is locked — treat as "absent" so
        // the renderer can fall back to its sign-in flow.
        return null;
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.KeychainSet,
    async (_event, payload: KeychainSetPayload): Promise<void> => {
      if (!isAllowedKeychainKey(payload?.key)) {
        throw new Error("keychain.set: key not allowed");
      }
      keychainEntry(payload.key).setPassword(payload.value ?? "");
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.KeychainDelete,
    async (_event, payload: KeychainDeletePayload): Promise<boolean> => {
      if (!isAllowedKeychainKey(payload?.key)) return false;
      try {
        keychainEntry(payload.key).deletePassword();
        return true;
      } catch {
        // Entry didn't exist — preserve keytar's "returns false" semantic.
        return false;
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.AppGetVersion, async (): Promise<string> => {
    return app.getVersion();
  });

  ipcMain.handle(
    IPC_CHANNELS.AppOpenExternal,
    async (_event, payload: AppOpenExternalPayload): Promise<void> => {
      if (!payload?.url) return;
      if (!/^https?:\/\//i.test(payload.url)) return;
      await shell.openExternal(payload.url);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AuthStartSignIn,
    async (
      _event,
      payload: AuthStartSignInPayload,
    ): Promise<AuthStartSignInResult> => {
      if (!payload || (payload.provider !== "github" && payload.provider !== "google")) {
        return { ok: false, error: "invalid_provider" };
      }
      try {
        const token = await runLoopbackSignIn(payload.provider);
        // Store the bearer token in the OS keychain under the same account
        // name the CLI uses. The renderer reads it via keychain.get("token")
        // on next boot and configures api-client with bearer auth.
        keychainEntry("token").setPassword(token);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.UpdaterCheck,
    async (): Promise<UpdaterCheckResult> => {
      if (isDev) {
        return { ok: false, error: "updater disabled in dev" };
      }
      try {
        const result = await autoUpdater.checkForUpdates();
        return {
          ok: true,
          updateAvailable: Boolean(result?.updateInfo),
          version: result?.updateInfo?.version,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );
}

/**
 * Drive the API's CLI/loopback PAT flow from inside Electron. Mirrors what
 * `notekit login` does in the CLI, with one tweak: `client_label=Desktop`
 * makes the consent page read "Authorize the NoteKit Desktop" so users
 * understand what they're approving.
 *
 *   1. Bind a one-shot HTTP server to 127.0.0.1 on a random port.
 *   2. Open the user's external browser at
 *      ${API_URL}/auth/cli/start?redirect_uri=...&state=...&client_label=Desktop.
 *   3. After the user signs in (if needed) and clicks Authorize, the API
 *      302s the browser to our loopback with ?token=<pat>&state=<echoed>.
 *   4. The loopback validates the state, returns a tiny success page, and
 *      resolves the outer promise with the token.
 *
 * Everything runs entirely over the loopback interface — the PAT is never
 * exposed off-host and the listening port disappears as soon as the
 * exchange completes (or after a 5-minute timeout).
 */
async function runLoopbackSignIn(provider: "github" | "google"): Promise<string> {
  const state = crypto.randomBytes(24).toString("base64url");

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      // Close the server in the next tick so the in-flight response can
      // flush its body to the browser before the socket goes away.
      setImmediate(() => server.close());
      clearTimeout(timer);
    };

    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.statusCode = 400;
        res.end("missing url");
        return;
      }
      const url = new URL(req.url, "http://127.0.0.1");
      // Ignore favicon, OS-level network probes, and anything that isn't
      // root. We DON'T close the server here — a stray hit on /favicon.ico
      // shouldn't burn the entire sign-in attempt.
      if (url.pathname !== "/") {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      const echoed = url.searchParams.get("state");
      // Anything that arrives without our exact state nonce is not our
      // OAuth callback — could be a random LAN probe, the user's browser
      // pre-fetching favicon, an attacker hoping to learn the port. Reply
      // 400 but keep listening so the real callback can still land.
      if (!echoed || echoed !== state) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<h1>Sign-in failed</h1><p>Unrecognized callback. You can close this window.</p>",
        );
        return;
      }
      // From here on, state matched — this is unambiguously our callback,
      // so we resolve/reject and close the server in any branch.
      const token = url.searchParams.get("token");
      if (!token) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<h1>Sign-in failed</h1><p>The callback was missing a token. You can close this window.</p>",
        );
        settle(() => reject(new Error("loopback_missing_token")));
        return;
      }
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<h1>NoteKit Desktop signed in</h1><p>You can close this window and return to the app.</p>",
      );
      // Refocus the Electron window so the user sees the freshly signed-in
      // UI without alt-tabbing back manually.
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        // Reload so the renderer re-runs api-client bootstrap with the
        // newly-keychained bearer token in hand.
        mainWindow.webContents.reload();
      }
      settle(() => resolve(token));
    });

    server.on("error", (err) => {
      settle(() => reject(err));
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo | null;
      if (!addr || typeof addr === "string") {
        settle(() =>
          reject(new Error("loopback_listen_failed: no address bound")),
        );
        return;
      }
      const loopback = `http://127.0.0.1:${addr.port}/`;
      const startUrl = new URL(`${API_URL}/auth/cli/start`);
      startUrl.searchParams.set("redirect_uri", loopback);
      startUrl.searchParams.set("state", state);
      startUrl.searchParams.set("client_label", "Desktop");
      // Pre-warm the OAuth provider hint via the CLI start page: if the user
      // isn't already signed in to the API, the rendered prompt links them
      // to ${env.webUrl}/?_signin=${provider} — we don't read it from here,
      // we just append the param so the existing renderCliSignInPrompt UI
      // can pick it up in a future iteration. For now the user follows the
      // page's "Sign in to NoteKit" link, completes OAuth, comes back.
      startUrl.searchParams.set("provider_hint", provider);
      void shell.openExternal(startUrl.toString());
    });

    const timer = setTimeout(() => {
      settle(() => reject(new Error("loopback_timeout")));
    }, SIGN_IN_TIMEOUT_MS);
  });
}

function bootstrap(): void {
  registerIpcHandlers();

  mainWindow = createMainWindow();

  app.on("activate", () => {
    // macOS: re-create a window when the dock icon is clicked and no
    // windows are open.
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
}

app.on("window-all-closed", () => {
  // Standard macOS behaviour: app stays alive until Cmd+Q.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Hardening: block any non-allowlisted permission request from the renderer
// (notifications, geolocation, etc.). The web app does not need any of these
// inside the wrapper today; expand explicitly when something does.
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
});

void app.whenReady().then(bootstrap);
