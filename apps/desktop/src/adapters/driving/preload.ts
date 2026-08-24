// SPDX-License-Identifier: MIT
// NoteKit desktop preload — MIT-licensed Electron wrapper around the
// @notekit/web build. Runs with contextIsolation=true and sandbox=true, so
// only the typed surface defined in the domain IPC contract is exposed to the
// renderer. This is a driving adapter: it hands the renderer a typed bridge it
// uses to drive the main process. Do not import anything node-only here beyond
// `electron` itself.

import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  invokeKeychain,
  type AuthStartSignInResult,
  type IpcChannel,
  type IpcContract,
  type NotekitDesktopBridge,
  type UpdaterCheckResult,
} from "../../domain/ipc-contract";

const invoker = {
  invoke<C extends IpcChannel>(
    channel: C,
    payload: IpcContract[C]["payload"],
  ): Promise<IpcContract[C]["result"]> {
    return ipcRenderer.invoke(channel, payload) as Promise<
      IpcContract[C]["result"]
    >;
  },
};

const keychain = invokeKeychain(invoker);

const bridge: NotekitDesktopBridge = {
  keychain,
  app: {
    getVersion(): Promise<string> {
      return invoker.invoke(IPC_CHANNELS.AppGetVersion, undefined);
    },
    openExternal(url: string): Promise<void> {
      return invoker.invoke(IPC_CHANNELS.AppOpenExternal, { url });
    },
    capturePage(rect?: {
      x: number;
      y: number;
      width: number;
      height: number;
    }): Promise<string | null> {
      return invoker.invoke(IPC_CHANNELS.AppCapturePage, { rect });
    },
  },
  updater: {
    checkForUpdates(): Promise<UpdaterCheckResult> {
      return invoker.invoke(IPC_CHANNELS.UpdaterCheck, undefined);
    },
  },
  auth: {
    startSignIn(provider: "github" | "google"): Promise<AuthStartSignInResult> {
      return invoker.invoke(IPC_CHANNELS.AuthStartSignIn, { provider });
    },
  },
};

try {
  contextBridge.exposeInMainWorld("notekit", bridge);
} catch (err) {
  // Surface preload errors to the main process console rather than
  // silently swallowing them. The renderer will just see `window.notekit`
  // as undefined and can fall back to web-only behaviour.
  // eslint-disable-next-line no-console -- preload bridge: no logger module available in this context
  console.error("[notekit-desktop] failed to expose bridge:", err);
}
