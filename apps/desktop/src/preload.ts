// SPDX-License-Identifier: MIT
// NoteKit desktop preload — MIT-licensed Electron wrapper around the
// @notekit/web build. Runs with contextIsolation=true and sandbox=true, so
// only the typed surface defined in ./ipc.ts is exposed to the renderer.
// Do not import anything node-only here beyond `electron` itself.

import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  invokeKeychain,
  type IpcChannel,
  type IpcContract,
  type NotekitDesktopBridge,
  type UpdaterCheckResult,
} from "./ipc";

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
  },
  updater: {
    checkForUpdates(): Promise<UpdaterCheckResult> {
      return invoker.invoke(IPC_CHANNELS.UpdaterCheck, undefined);
    },
  },
};

try {
  contextBridge.exposeInMainWorld("notekit", bridge);
} catch (err) {
  // Surface preload errors to the main process console rather than
  // silently swallowing them. The renderer will just see `window.notekit`
  // as undefined and can fall back to web-only behaviour.
  // eslint-disable-next-line no-console
  console.error("[notekit-desktop] failed to expose bridge:", err);
}
