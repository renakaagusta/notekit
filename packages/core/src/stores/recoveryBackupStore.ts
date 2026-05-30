/**
 * UI state around backing up the recovery key.
 *
 * Setup is now silent — the recovery phrase is generated and stored on the
 * device without ever showing a wall. The trade-off is that this device holds
 * the *only* copy until the user takes a backup off it. This store tracks
 * whether a backup is still owed (so the nudge can show) and whether the
 * backup sheet is open, and exposes actions to refresh / open / dismiss.
 *
 * The source of truth for "is it backed up" is the on-device record in
 * recovery-store.ts; this store mirrors it for reactive UI and remembers a
 * per-session "dismissed" flag so the banner can be temporarily hidden without
 * marking a real backup.
 */
import { create } from "zustand";
import {
  loadStoredRecovery,
  needsRecoveryBackup,
  markRecoveryBackedUp,
  type BackupMethod,
  type StoredRecovery,
} from "../lib/crypto/recovery-store";

// Setup is silent, so we don't nag at first run — only once the user has
// actually encrypted something does the "this is the only copy" warning earn
// its place. This flag (persisted) is flipped the first time an encrypt is
// confirmed; the nudge stays dark until then.
const ARMED_KEY = "nk:backup-nudge-armed";

function readArmed(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(ARMED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeArmed(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ARMED_KEY, "1");
  } catch {
    // ignore quota / private-mode failures
  }
}

interface RecoveryBackupState {
  /** True when an un-backed-up local recovery copy exists. */
  needsBackup: boolean;
  /** True once the user has encrypted at least one item (nudge gate). */
  armed: boolean;
  /** User dismissed the banner this session (does not clear needsBackup). */
  dismissed: boolean;
  /** Backup sheet visibility. */
  sheetOpen: boolean;
  /** Re-read the on-device record and update needsBackup. */
  refresh(): Promise<void>;
  /** Arm the nudge — call when the user first encrypts something. */
  arm(): void;
  openSheet(): void;
  closeSheet(): void;
  dismissBanner(): void;
  /** Mark a backup as taken (persists), then refresh. */
  completeBackup(via: BackupMethod): Promise<void>;
  /** Load the stored recovery (mnemonic etc.) for the sheet to display. */
  load(): Promise<StoredRecovery | null>;
}

export const useRecoveryBackupStore = create<RecoveryBackupState>((set) => ({
  needsBackup: false,
  armed: readArmed(),
  dismissed: false,
  sheetOpen: false,
  async refresh() {
    try {
      const needs = await needsRecoveryBackup();
      set({ needsBackup: needs, armed: readArmed() });
    } catch {
      // storage unavailable — leave state as-is, fail quiet
    }
  },
  arm() {
    writeArmed();
    set({ armed: true });
  },
  openSheet() {
    set({ sheetOpen: true });
  },
  closeSheet() {
    set({ sheetOpen: false });
  },
  dismissBanner() {
    set({ dismissed: true });
  },
  async completeBackup(via) {
    await markRecoveryBackedUp(via);
    set({ needsBackup: false, dismissed: false });
  },
  load() {
    return loadStoredRecovery();
  },
}));
