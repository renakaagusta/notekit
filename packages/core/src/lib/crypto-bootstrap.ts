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
  ensureSelfRegistered,
  isVaultInitialized,
  listDevices,
  readRecovery,
  readVaultConfig,
} from "./secrets-vault";
import { useAuthStore } from "../stores/authStore";
import { loadStoredRecovery } from "./crypto/recovery-store";
import { recoverySigningFromMnemonic } from "./crypto/recovery";
import { toB64 } from "./crypto/signing";
import { verifySigningKeyTrust } from "./crypto/trust-store";
import type { DeviceIdentity } from "./crypto/device-key";

/**
 * Member device auto-register (issue #14): if this is a member's device that
 * holds the member signing key (its stored recovery mnemonic), write its own
 * device record into a member vault it's missing from — so it joins without the
 * owner re-admitting it. Returns true if it registered (caller → `ready`).
 * No-op (false) when we're not signed in, hold no mnemonic, or aren't a member.
 */
async function tryMemberSelfRegister(device: DeviceIdentity): Promise<boolean> {
  const email = useAuthStore.getState().user?.email;
  if (!email) return false;
  const stored = await loadStoredRecovery();
  if (!stored?.mnemonic) return false;
  const signing = await recoverySigningFromMnemonic(stored.mnemonic);
  const res = await ensureSelfRegistered({ memberId: email }, device, signing);
  return res.registered;
}

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
      // Vault already initialized elsewhere — must pair this device, unless
      // we're a member holding our member signing key, in which case we
      // self-register (issue #14) and skip pairing entirely.
      const fresh = await createDeviceIdentity();
      store.setDevice(fresh);
      if (await tryMemberSelfRegister(fresh)) {
        store.setPhase("ready");
        return;
      }
      store.setPhase("needs-pair");
      return;
    }

    const devices = await listDevices();
    const known = devices.some((d) => d.deviceId === existing.deviceId);
    if (!known) {
      store.setDevice(existing);
      // A member's existing device that isn't in *this* vault yet self-joins.
      if (await tryMemberSelfRegister(existing)) {
        store.setPhase("ready");
        return;
      }
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
