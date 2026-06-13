/**
 * Per-device age identity. The private key never leaves this device — it's
 * stored in IndexedDB and read only when we need to decrypt the vault.
 *
 * The public recipient (age1…) is committed to the vault under
 * .notekit/devices/{deviceId}.json so other devices can encrypt to us.
 */
import { generateIdentity, identityToRecipient } from "age-encryption";
import { nanoid } from "nanoid";
import { getNativePlatform, type NativePlatform } from "../native";

const DB_NAME = "notekit-crypto";
// v2 added the "recovery" store (see recovery-store.ts). Both files open the
// same DB, so they must agree on the version and each create any missing store
// in onupgradeneeded — otherwise whichever opens at the lower version throws
// VersionError.
const DB_VERSION = 2;
const STORE = "device";
const RECOVERY_STORE = "recovery";
const KEY = "self";

export interface DeviceIdentity {
  deviceId: string;
  name: string;
  identity: string;
  recipient: string;
  createdAt: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
      if (!db.objectStoreNames.contains(RECOVERY_STORE)) {
        db.createObjectStore(RECOVERY_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDeviceIdentity(): Promise<DeviceIdentity | null> {
  return idbGet<DeviceIdentity>(KEY);
}

export async function createDeviceIdentity(name?: string): Promise<DeviceIdentity> {
  const identity = await generateIdentity();
  const recipient = await identityToRecipient(identity);
  const device: DeviceIdentity = {
    deviceId: nanoid(10),
    name: name?.trim() || defaultDeviceName(),
    identity,
    recipient,
    createdAt: new Date().toISOString(),
  };
  await idbPut(KEY, device);
  return device;
}

export async function clearDeviceIdentity(): Promise<void> {
  await idbDelete(KEY);
}

/**
 * A human label for this device, shown in the Devices list. We distinguish the
 * three runtimes so a Chrome tab doesn't read the same as the installed app:
 *
 *   - Capacitor app  → the hardware ("iPhone" / "iPad" / "Android")
 *   - Electron app   → the OS ("Mac" / "Windows" / "Linux"), like a desktop app
 *   - Web browser    → "<Browser> browser in <OS>" (e.g. "Chrome browser in Mac")
 *
 * so two sessions on the same Mac — the desktop app and a browser tab — are
 * told apart.
 */
function defaultDeviceName(): string {
  if (typeof navigator === "undefined") return "Device";
  return deviceLabel(navigator.userAgent, {
    native: getNativePlatform(),
    electron: isElectronWrapper(),
  });
}

/**
 * Pure naming core — separated from the global reads above so it's testable.
 * Exported for the unit test; callers should use the device's stored `name`.
 */
export function deviceLabel(
  ua: string,
  env: { native: NativePlatform; electron: boolean },
): string {
  // Native mobile app — name it by the hardware, not the embedded WebView.
  if (env.native === "ios") return /iPad/i.test(ua) ? "iPad" : "iPhone";
  if (env.native === "android") return "Android";

  const os = osLabel(ua);

  // Electron desktop wrapper — a real installed app, so the bare OS name reads
  // right (matches how WhatsApp's desktop app shows "Mac").
  if (env.electron) return os || "Desktop";

  // Plain web browser — keep it distinct from the native app.
  const browser = browserLabel(ua);
  return os ? `${browser} browser in ${os}` : `${browser} browser`;
}

function isElectronWrapper(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { notekit?: { keychain?: unknown } };
  return !!w.notekit?.keychain;
}

function osLabel(ua: string): string {
  if (/Mac/i.test(ua)) return "Mac";
  if (/Win/i.test(ua)) return "Windows";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "";
}

function browserLabel(ua: string): string {
  // Order matters: Edge / Opera carry "Chrome" in their UA, so match them
  // first; Chrome carries "Safari", so Safari comes last.
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua) || /\bOpera\b/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Browser";
}
