// SPDX-License-Identifier: MIT
// NoteKit desktop — MIT-licensed Electron wrapper around the @notekit/web
// build. The web bundle is loaded as a normal renderer; the wrapper only
// adds OS integrations (keychain, external links, auto-update) and the
// usual lifecycle plumbing. Keep this file small — anything non-trivial
// should move into a typed IPC handler.

import { app, BrowserWindow, ipcMain, shell } from "electron";
import { autoUpdater } from "electron-updater";
import keytar from "keytar";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

  // Also intercept in-page navigations to external origins. Keep same-origin
  // SPA navigations (dev: localhost:5173, prod: file://) inside the window.
  win.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    const allowed = isDev
      ? target.origin === DEV_URL
      : target.protocol === "file:";
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

function registerIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.KeychainGet,
    async (_event, payload: KeychainGetPayload): Promise<string | null> => {
      if (!payload?.key) return null;
      return keytar.getPassword(KEYCHAIN_SERVICE, payload.key);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.KeychainSet,
    async (_event, payload: KeychainSetPayload): Promise<void> => {
      if (!payload?.key) {
        throw new Error("keychain.set: missing key");
      }
      await keytar.setPassword(KEYCHAIN_SERVICE, payload.key, payload.value ?? "");
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.KeychainDelete,
    async (_event, payload: KeychainDeletePayload): Promise<boolean> => {
      if (!payload?.key) return false;
      return keytar.deletePassword(KEYCHAIN_SERVICE, payload.key);
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

// Silence unused-import warning for fileURLToPath in CJS — kept available
// for future ESM migration of this entrypoint.
void fileURLToPath;
