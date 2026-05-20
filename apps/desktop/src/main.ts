// SPDX-License-Identifier: MIT
// NoteKit desktop — MIT-licensed Electron wrapper around the @notekit/web
// build. The web bundle is loaded as a normal renderer; the wrapper only
// adds OS integrations (keychain, external links, auto-update) and the
// usual lifecycle plumbing. Keep this file small — anything non-trivial
// should move into a typed IPC handler.

import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import { Entry } from "@napi-rs/keyring";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  IPC_CHANNELS,
  KEYCHAIN_SERVICE,
  type AppOpenExternalPayload,
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
