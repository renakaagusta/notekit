/**
 * Per-device age identity. The private key never leaves this device — it's
 * stored in IndexedDB and read only when we need to decrypt the vault.
 *
 * The public recipient (age1…) is committed to the vault under
 * .notekit/devices/{deviceId}.json so other devices can encrypt to us.
 */
import { generateIdentity, identityToRecipient } from "age-encryption";
import { nanoid } from "nanoid";

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

function defaultDeviceName(): string {
  if (typeof navigator === "undefined") return "Device";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Win/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Device";
}
