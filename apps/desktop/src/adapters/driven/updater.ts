// SPDX-License-Identifier: MIT
// Driven adapter: auto-update checks via electron-updater. The main process
// drives this on demand; it stays disabled in dev where there is no signed
// release feed to talk to.

import { autoUpdater } from "electron-updater";
import type { UpdaterCheckResult } from "../../domain/ipc-contract";

export async function checkForUpdates(isDev: boolean): Promise<UpdaterCheckResult> {
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
}
