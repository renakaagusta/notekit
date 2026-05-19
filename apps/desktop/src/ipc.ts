// SPDX-License-Identifier: MIT
// Shared IPC channel definitions for the NoteKit desktop wrapper.
// Both main and preload import these constants and types so the typed bridge
// stays in sync. Keep this file dependency-free so it can be required from
// either Electron context without pulling in node-only modules.

export const IPC_CHANNELS = {
  KeychainGet: "notekit:keychain:get",
  KeychainSet: "notekit:keychain:set",
  KeychainDelete: "notekit:keychain:delete",
  AppGetVersion: "notekit:app:getVersion",
  AppOpenExternal: "notekit:app:openExternal",
  UpdaterCheck: "notekit:updater:check",
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// The keytar service name; collected here so main/preload agree.
export const KEYCHAIN_SERVICE = "com.notekit.desktop";

export interface KeychainGetPayload {
  key: string;
}

export interface KeychainSetPayload {
  key: string;
  value: string;
}

export interface KeychainDeletePayload {
  key: string;
}

export interface AppOpenExternalPayload {
  url: string;
}

export interface UpdaterCheckResult {
  ok: boolean;
  updateAvailable?: boolean;
  version?: string;
  error?: string;
}

// Channel-to-payload/return map. Used by the typed helpers below.
export interface IpcContract {
  [IPC_CHANNELS.KeychainGet]: {
    payload: KeychainGetPayload;
    result: string | null;
  };
  [IPC_CHANNELS.KeychainSet]: {
    payload: KeychainSetPayload;
    result: void;
  };
  [IPC_CHANNELS.KeychainDelete]: {
    payload: KeychainDeletePayload;
    result: boolean;
  };
  [IPC_CHANNELS.AppGetVersion]: {
    payload: void;
    result: string;
  };
  [IPC_CHANNELS.AppOpenExternal]: {
    payload: AppOpenExternalPayload;
    result: void;
  };
  [IPC_CHANNELS.UpdaterCheck]: {
    payload: void;
    result: UpdaterCheckResult;
  };
}

// Small helper so the preload's keychain wrapper has one place to live and
// stays in sync with main's handler. Preload just imports it.
export interface KeychainInvoker {
  invoke<C extends IpcChannel>(
    channel: C,
    payload: IpcContract[C]["payload"],
  ): Promise<IpcContract[C]["result"]>;
}

export function invokeKeychain(invoker: KeychainInvoker) {
  return {
    get(key: string): Promise<string | null> {
      return invoker.invoke(IPC_CHANNELS.KeychainGet, { key });
    },
    set(key: string, value: string): Promise<void> {
      return invoker.invoke(IPC_CHANNELS.KeychainSet, { key, value });
    },
    delete(key: string): Promise<boolean> {
      return invoker.invoke(IPC_CHANNELS.KeychainDelete, { key });
    },
  };
}

// Surface exposed on `window.notekit` via contextBridge. Re-exported so the
// renderer (apps/web) could one day import these types if it wants strong
// typing of the bridge — kept here, not in @notekit/core, to avoid leaking
// Electron-specific concerns into the shared package.
export interface NotekitDesktopBridge {
  keychain: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<boolean>;
  };
  app: {
    getVersion(): Promise<string>;
    openExternal(url: string): Promise<void>;
  };
  updater: {
    checkForUpdates(): Promise<UpdaterCheckResult>;
  };
}
