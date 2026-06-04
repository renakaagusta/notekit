/**
 * Local persistence of the recovery secret.
 *
 * The vault's master fallback is a 24-word BIP39 mnemonic. Historically the
 * app generated it, made the user transcribe it on screen, and then threw the
 * words away — only the derived *public* recipient lives in the repo
 * (`.notekit/recovery.json`). That forced a key ceremony on every new user.
 *
 * To make setup invisible (auto-store the key, offer backup later) we instead
 * keep the mnemonic in this device's secure store so it can be re-shown,
 * copied, or exported on demand — and we track whether the user has taken it
 * off this device yet (`backedUp`). Nothing here ever leaves the device.
 *
 * Storage today is IndexedDB (the same `notekit-crypto` DB the device key uses)
 * which is the web/Electron/Capacitor-WebView secure-ish store. The single
 * {@link secureGet}/{@link securePut} seam is where a platform can later swap
 * in Keychain / Keystore / safeStorage without touching callers.
 */
import {
  generateRecoveryMnemonic,
  recoveryFromMnemonic,
} from "./recovery";

const DB_NAME = "notekit-crypto";
const DB_VERSION = 2;
const DEVICE_STORE = "device";
const RECOVERY_STORE = "recovery";
const RECOVERY_KEY = "self";

/** What we keep on-device for the recovery key. */
export interface StoredRecovery {
  /** 24-word BIP39 phrase. The only copy outside an explicit user backup. */
  mnemonic: string;
  /** Derived age public recipient — matches `.notekit/recovery.json`. */
  recipient: string;
  createdAt: string;
  /** True once the user has exported/copied/revealed-and-confirmed a backup. */
  backedUp: boolean;
  backedUpAt?: string;
  /** How the last backup was taken — for display only. */
  backedUpVia?: BackupMethod;
}

export type BackupMethod = "download" | "copy" | "share" | "reveal" | "manual";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // device store may already exist from v1; create it if a fresh client
      // lands straight on v2.
      if (!db.objectStoreNames.contains(DEVICE_STORE)) {
        db.createObjectStore(DEVICE_STORE);
      }
      if (!db.objectStoreNames.contains(RECOVERY_STORE)) {
        db.createObjectStore(RECOVERY_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function secureGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(RECOVERY_STORE, "readonly");
    const req = tx.objectStore(RECOVERY_STORE).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function securePut(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECOVERY_STORE, "readwrite");
    tx.objectStore(RECOVERY_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function secureDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECOVERY_STORE, "readwrite");
    tx.objectStore(RECOVERY_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Load the on-device recovery secret, or null if this device has none. */
export async function loadStoredRecovery(): Promise<StoredRecovery | null> {
  return secureGet<StoredRecovery>(RECOVERY_KEY);
}

/**
 * Generate a fresh recovery key, persist it locally (marked not-yet-backed-up),
 * and return it. Used by silent vault setup. The caller initializes the vault
 * with the returned recipient.
 */
export async function createAndStoreRecovery(): Promise<StoredRecovery> {
  const mnemonic = generateRecoveryMnemonic();
  const { recipient } = await recoveryFromMnemonic(mnemonic);
  const record: StoredRecovery = {
    mnemonic,
    recipient,
    createdAt: new Date().toISOString(),
    backedUp: false,
  };
  await securePut(RECOVERY_KEY, record);
  return record;
}

/**
 * Persist a recovery phrase the user supplied themselves (e.g. unlocking a new
 * device via the recovery flow). Since they already hold the words, it's
 * stored as already-backed-up so the nudge doesn't fire on this device.
 */
export async function importRecovery(mnemonic: string): Promise<StoredRecovery> {
  const { recipient } = await recoveryFromMnemonic(mnemonic);
  const record: StoredRecovery = {
    mnemonic: mnemonic.trim(),
    recipient,
    createdAt: new Date().toISOString(),
    backedUp: true,
    backedUpAt: new Date().toISOString(),
    backedUpVia: "manual",
  };
  await securePut(RECOVERY_KEY, record);
  return record;
}

/** Record that the user has taken a backup of the recovery phrase. */
export async function markRecoveryBackedUp(
  via: BackupMethod,
): Promise<StoredRecovery | null> {
  const current = await loadStoredRecovery();
  if (!current) return null;
  const next: StoredRecovery = {
    ...current,
    backedUp: true,
    backedUpAt: new Date().toISOString(),
    backedUpVia: via,
  };
  await securePut(RECOVERY_KEY, next);
  return next;
}

/** Forget the on-device copy (e.g. on sign-out / reset). */
export async function clearStoredRecovery(): Promise<void> {
  await secureDelete(RECOVERY_KEY);
}

/**
 * Whether this device should nag the user to back up. True only when we hold
 * an un-backed-up copy. A *legacy* vault (set up before silent-setup existed)
 * has no local copy at all — the user already did the paper ceremony — so we
 * never nag for it.
 */
export async function needsRecoveryBackup(): Promise<boolean> {
  const stored = await loadStoredRecovery();
  return !!stored && !stored.backedUp;
}
