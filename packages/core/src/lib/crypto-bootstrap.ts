/**
 * Decide the next crypto phase on app load. Reads IndexedDB and the vault
 * to figure out whether the user needs first-run setup, device pairing, or is
 * already good to go.
 */
import { useCryptoStore } from "../stores/cryptoStore";
import { useVaultStore } from "../stores/vaultStore";
import {
  loadDeviceIdentity,
  createDeviceIdentity,
} from "./crypto/device-key";
import {
  isVaultInitialized,
  listDevices,
  readRecovery,
  readVaultConfig,
} from "./secrets-vault";
import { loadStoredRecovery } from "./crypto/recovery-store";
import { recoverySigningFromMnemonic } from "./crypto/recovery";
import { toB64 } from "./crypto/signing";
import { verifySigningKeyTrust } from "./crypto/trust-store";

/**
 * Pin/verify the vault's recovery signing key against this client's TOFU pin
 * (and the local mnemonic, when held). Catches downgrade and key-substitution
 * attacks that signed-mode enforcement alone can't (it could be bypassed by
 * stripping the signing key). No-op for legacy never-signed vaults.
 */
async function verifyRecoveryTrust(
  recovery: Awaited<ReturnType<typeof readRecovery>>,
): Promise<void> {
  const vaultId = useVaultStore.getState().activeId;
  if (!vaultId) return; // no active vault → nothing to pin against
  let expected: string | null = null;
  const stored = await loadStoredRecovery();
  if (stored?.mnemonic) {
    const sk = await recoverySigningFromMnemonic(stored.mnemonic);
    expected = toB64(sk.publicKey);
  }
  verifySigningKeyTrust(vaultId, recovery?.signingKey ?? null, expected);
}

export async function bootstrapCrypto(): Promise<void> {
  const store = useCryptoStore.getState();
  store.setPhase("checking");
  try {
    const existing = await loadDeviceIdentity();
    const [vaultReady, config] = await Promise.all([
      isVaultInitialized(),
      readVaultConfig(),
    ]);
    store.setEncryptionRequired(config.encryption === "required");

    if (!vaultReady) {
      // Either a brand-new vault or someone needs to set up crypto.
      store.setDevice(existing);
      store.setPhase("needs-setup");
      return;
    }

    // Verify the vault's signing root against our TOFU pin (and our mnemonic
    // if we hold one) before trusting any device records or pairing. A
    // downgrade/substitution throws here and surfaces as a crypto error rather
    // than silently letting an injected key through.
    const recovery = await readRecovery();
    await verifyRecoveryTrust(recovery);

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
    store.setDevice(existing);
    store.setPhase("ready");
    // (Publishing our public keys to the directory happens in App's
    // crypto-ready effect, which fires for both this path and the first-run
    // VaultSetup path.)
  } catch (e) {
    store.setError((e as Error).message);
  }
}
