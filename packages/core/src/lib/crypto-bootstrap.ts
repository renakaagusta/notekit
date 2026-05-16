/**
 * Decide the next crypto phase on app load. Reads IndexedDB and the vault
 * to figure out whether the user needs first-run setup, device pairing, or is
 * already good to go.
 */
import { useCryptoStore } from "../stores/cryptoStore";
import {
  loadDeviceIdentity,
  createDeviceIdentity,
} from "./crypto/device-key";
import {
  isVaultInitialized,
  listDevices,
  readRecovery,
} from "./secrets-vault";

export async function bootstrapCrypto(): Promise<void> {
  const store = useCryptoStore.getState();
  store.setPhase("checking");
  try {
    const existing = await loadDeviceIdentity();
    const vaultReady = await isVaultInitialized();

    if (!vaultReady) {
      // Either a brand-new vault or someone needs to set up crypto.
      store.setDevice(existing);
      store.setPhase("needs-setup");
      return;
    }

    if (!existing) {
      // Vault already initialized elsewhere — must pair this device.
      const fresh = await createDeviceIdentity();
      store.setDevice(fresh);
      store.setPhase("needs-pair");
      return;
    }

    const devices = await listDevices();
    const known = devices.some((d) => d.deviceId === existing.deviceId);
    if (!known) {
      store.setDevice(existing);
      store.setPhase("needs-pair");
      return;
    }
    // Sanity: recovery record should exist; if not, surface it but don't block.
    await readRecovery();
    store.setDevice(existing);
    store.setPhase("ready");
  } catch (e) {
    store.setError((e as Error).message);
  }
}
