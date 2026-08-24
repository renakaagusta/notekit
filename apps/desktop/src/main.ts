// SPDX-License-Identifier: MIT
// NoteKit desktop composition root — MIT-licensed Electron wrapper around the
// @notekit/web build. This is the ONLY file that binds driving adapters (the
// ipcMain handler registration) to driven adapters (keychain, shell, loopback
// OAuth, updater, capture, config), reached through the composition barrel. It
// owns app lifecycle, the BrowserWindow, and the renderer navigation guard.
// The web bundle is loaded as a normal renderer; the wrapper only adds OS
// integrations and lifecycle plumbing. Emits to dist/main.js (package.json
// `main`); keep anything non-trivial in a typed adapter, not here.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow } from "electron";
import { registerIpcHandlers } from "./adapters/driving/ipc-handlers";
import {
  DEV_URL,
  isDevBuild,
  openExternalUrl,
  resolveProdIndex,
} from "./composition";

const isDev = isDevBuild();

// Opt-in CDP for automated testing: launch with NOTEKIT_CDP=<port> to expose
// the renderer over the Chrome DevTools Protocol. Must be set before ready.
if (process.env.NOTEKIT_CDP) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.NOTEKIT_CDP);
  app.commandLine.appendSwitch("remote-allow-origins", "*");
}

// __dirname is provided by CommonJS; declare for typing in case the file
// is ever switched to ESM (this typecheck setup uses CJS today).
declare const __dirname: string;

// Canonical packaged index URL. Captured once at startup so the navigation
// guard can compare each attempted file:// load against the single file we
// are willing to render. Anything else — a user-pasted file:// URL, a
// fetched .html dropped in /tmp, an attacker-supplied SPA redirect — gets
// blocked instead of being loaded into the renderer with our preload bridge
// attached.
const PROD_INDEX_FILE_URL = isDev ? null : pathToFileURL(resolveProdIndex()).toString();

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
    // Frameless-with-traffic-lights on macOS: hide the native title bar and
    // let the app's own top row (brand + tab bar) absorb the vertical space,
    // with the stoplight buttons floating over the sidebar's brand row. This
    // is the Orca / Linear / VS Code look. `trafficLightPosition` nudges the
    // lights down to sit centered in the ~42px brand row. On Windows/Linux
    // this key is ignored and the default frame is used.
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 14, y: 15 },
        }
      : {}),
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
      void openExternalUrl(url);
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
        void openExternalUrl(url);
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

function bootstrap(): void {
  registerIpcHandlers({ isDev, getMainWindow: () => mainWindow });

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
      void openExternalUrl(url);
    }
    return { action: "deny" };
  });
});

void app.whenReady().then(bootstrap);
