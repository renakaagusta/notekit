// SPDX-License-Identifier: MIT
// Driving adapter: register the typed ipcMain handlers the renderer invokes.
// Each handler parses the incoming payload, enforces the keychain-key policy,
// and delegates the actual OS/native work to driven adapters reached through
// the composition barrel — the driving layer never touches a driven adapter
// directly.

import { app, ipcMain, type BrowserWindow } from "electron";
import {
  IPC_CHANNELS,
  capturePageDataUrl,
  checkForUpdates,
  isAllowedKeychainKey,
  keychainGet,
  keychainSet,
  keychainDelete,
  openExternalUrl,
  resolveApiUrl,
  runLoopbackSignIn,
  SIGN_IN_TIMEOUT_MS,
  type AppCapturePagePayload,
  type AppOpenExternalPayload,
  type AuthStartSignInPayload,
  type AuthStartSignInResult,
  type KeychainDeletePayload,
  type KeychainGetPayload,
  type KeychainSetPayload,
  type UpdaterCheckResult,
} from "../../composition";

export interface IpcHandlerDependencies {
  isDev: boolean;
  getMainWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(dependencies: IpcHandlerDependencies): void {
  const { isDev, getMainWindow } = dependencies;

  ipcMain.handle(
    IPC_CHANNELS.KeychainGet,
    async (_event, payload: KeychainGetPayload): Promise<string | null> => {
      if (!isAllowedKeychainKey(payload?.key)) return null;
      return keychainGet(payload.key);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.KeychainSet,
    async (_event, payload: KeychainSetPayload): Promise<void> => {
      if (!isAllowedKeychainKey(payload?.key)) {
        throw new Error("keychain.set: key not allowed");
      }
      keychainSet(payload.key, payload.value ?? "");
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.KeychainDelete,
    async (_event, payload: KeychainDeletePayload): Promise<boolean> => {
      if (!isAllowedKeychainKey(payload?.key)) return false;
      return keychainDelete(payload.key);
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
      await openExternalUrl(payload.url);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.AppCapturePage,
    async (event, payload: AppCapturePagePayload): Promise<string | null> => {
      return capturePageDataUrl(event.sender, payload);
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
        const token = await runLoopbackSignIn(payload.provider, {
          apiUrl: resolveApiUrl(),
          timeoutMs: SIGN_IN_TIMEOUT_MS,
          onTokenReceived: () => {
            const mainWindow = getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.focus();
              // Reload so the renderer re-runs api-client bootstrap with the
              // newly-keychained bearer token in hand.
              mainWindow.webContents.reload();
            }
          },
        });
        // Store the bearer token in the OS keychain under the same account
        // name the CLI uses. The renderer reads it via keychain.get("token")
        // on next boot and configures api-client with bearer auth.
        keychainSet("token", token);
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
      return checkForUpdates(isDev);
    },
  );
}
