/**
 * Decide the next crypto phase on app load. Reads IndexedDB and the vault
 * to figure out whether the user needs first-run setup, device pairing, or is
 * already good to go.
 */
import { useAuthStore } from "../adapters/driving/stores/authStore";
import { useCryptoStore } from "../adapters/driving/stores/cryptoStore";
import { useVaultStore } from "../adapters/driving/stores/vaultStore";
import type { LoggerPort } from "../application/ports/out/LoggerPort";
import {
  loadDeviceIdentity,
  createDeviceIdentity,
} from "../composition/device-key";
import type { DeviceIdentity } from "./crypto/device-key";
import type { VaultKey } from "./crypto/keybox";
import {
  recoverySigningFromMnemonic,
  recoveryFromMnemonic,
} from "./crypto/recovery";
import { loadStoredRecovery } from "./crypto/recovery-store";
import { toB64 } from "./crypto/signing";
import { verifySigningKeyTrust } from "./crypto/trust-store";
import {
  ensureSelfRegistered,
  isVaultInitialized,
  listDevices,
  readMembers,
  readRecovery,
  readVaultConfig,
  reEncryptVaultIfMembersChanged,
  keyboxExists,
  unlockVaultKey,
  addSelfToKeybox,
  setActiveVaultKey,
  beginVaultReadWindow,
  endVaultReadWindow,
  prefetchBootstrapFiles,
  vaultReadServedFromCache,
} from "./secrets-vault";

let logger!: LoggerPort;

/**
 * Bind the logger this bootstrap uses. Called once by the composition root
 * before boot runs, keeping the orchestrator free of a driven-adapter import.
 */
export function configureCryptoBootstrap(ports: { logger: LoggerPort }): void {
  logger = ports.logger;
}

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
 * Phase 2 of member auto-register (#14), fire-and-forget after `ready`: when a
 * member vault's recipient set has changed (e.g. a new member device joined),
 * an already-authorized device re-seals history to include it. No-ops on a
 * device that can't decrypt (the newcomer skips everything). Tracked per-vault
 * in localStorage so it runs only when the set actually changes.
 */
async function reconcileMemberRecipients(device: DeviceIdentity): Promise<void> {
  try {
    const vaultId = useVaultStore.getState().activeId;
    if (!vaultId) return;
    if ((await readMembers()).size === 0) return; // not a member vault
    const key = `nk:reenc-sig:${vaultId}`;
    const hasLS = typeof localStorage !== "undefined";
    const prev = hasLS ? localStorage.getItem(key) : null;
    const { changed, signature } = await reEncryptVaultIfMembersChanged(device, prev);
    if (changed && hasLS) localStorage.setItem(key, signature);
  } catch (e) {
    logger.warn("[crypto] member recipient reconcile failed", e);
  }
}

/**
 * Defer the background reconcile off the boot-critical path. It re-reads device
 * + member records (already fetched during bootstrap) and would otherwise
 * contend with the initial content pull for the browser's ~6-connection budget,
 * slowing first paint. It's eventually-consistent maintenance, so a few seconds'
 * delay is harmless.
 */
function scheduleReconcile(device: DeviceIdentity): void {
  setTimeout(() => void reconcileMemberRecipients(device), 4000);
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

/**
 * Envelope mode (issue #13): unlock the vault key from `.notekit/keybox.age` and
 * install it into the content-crypto seam + store, so every content read/write
 * this session uses the vault key instead of per-device recipients. No-op for
 * legacy vaults (no keybox) — leaves the seam null so content stays per-device.
 *
 * A returning device is already a keybox recipient and unlocks directly. A
 * device that just self-registered via the recovery phrase isn't a recipient
 * yet, so it unlocks via the recovery identity and adds itself (owner path).
 */
async function installVaultKey(device: DeviceIdentity): Promise<void> {
  const store = useCryptoStore.getState();
  try {
    if (!(await keyboxExists())) {
      setActiveVaultKey(null);
      store.setVaultKey(null);
      return;
    }
    let vaultKey: VaultKey | null = null;
    try {
      vaultKey = await unlockVaultKey(device);
    } catch {
      // Not a keybox recipient yet — fall back to the recovery phrase to unlock
      // and self-add (owner multi-device). A member device that can't sign the
      // keybox reads via V and is reconciled into it by an owner device later.
      const stored = await loadStoredRecovery();
      if (stored?.mnemonic) {
        const [recId, recSigning] = await Promise.all([
          recoveryFromMnemonic(stored.mnemonic),
          recoverySigningFromMnemonic(stored.mnemonic),
        ]);
        vaultKey = await addSelfToKeybox(device, recId.identity, recSigning);
      }
    }
    setActiveVaultKey(vaultKey);
    store.setVaultKey(vaultKey);
  } catch (e) {
    logger.warn("[crypto] vault-key install failed", e);
    setActiveVaultKey(null);
    store.setVaultKey(null);
  }
}

/**
 * Attempt to join a vault via member self-registration (issue #14). Installs
 * the vault key and marks the session ready when successful. Returns `true` if
 * the device is now ready, `false` if it still needs the pairing flow.
 * Background flag controls whether to schedule the member reconcile.
 */
async function tryMemberJoin(
  device: DeviceIdentity,
  background: boolean,
): Promise<boolean> {
  if (!(await tryMemberSelfRegister(device))) return false;
  await installVaultKey(device);
  useCryptoStore.getState().setPhase("ready");
  if (!background) scheduleReconcile(device);
  return true;
}

/**
 * One bootstrap pass. `background` = SWR pass 2 (network revalidation): don't
 * flash "checking", don't re-schedule the member reconcile, and swallow errors
 * (a failed revalidation just leaves the last-known state until next launch).
 */
async function runBootstrap(background: boolean): Promise<void> {
  const store = useCryptoStore.getState();
  if (!background) store.setPhase("checking");
  // Pass 1 (foreground) serves crypto files from cache for an instant "ready";
  // pass 2 (background) reads the network to authoritatively revalidate.
  beginVaultReadWindow({ preferCache: !background });
  prefetchBootstrapFiles();
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
      if (await tryMemberJoin(fresh, background)) return;
      store.setPhase("needs-pair");
      return;
    }

    const devices = await listDevices();
    const known = devices.some((d) => d.deviceId === existing.deviceId);
    if (!known) {
      store.setDevice(existing);
      // A member's existing device that isn't in *this* vault yet self-joins.
      if (await tryMemberJoin(existing, background)) return;
      store.setPhase("needs-pair");
      return;
    }
    store.setDevice(existing);
    await installVaultKey(existing);
    store.setPhase("ready");
    // Phase 2 (#14): re-seal history if a new member device joined the set.
    if (!background) scheduleReconcile(existing);
    // (Publishing our public keys to the directory happens in App's
    // crypto-ready effect, which fires for both this path and the first-run
    // VaultSetup path.)
  } catch (e) {
    // Pass 1 surfaces the error; a background revalidation failure (e.g. offline)
    // just leaves the optimistic state — we retry on the next launch.
    if (!background) store.setError((e as Error).message);
    else logger.warn("[crypto] background revalidation failed", e);
  } finally {
    endVaultReadWindow();
  }
}

/**
 * SWR crypto boot (stale-while-revalidate). Pass 1 reaches "ready" instantly
 * from the local ciphertext cache + the on-device key, so content decrypts with
 * no network wait. If pass 1 was served from cache (optimistic), pass 2
 * revalidates the trust root / device membership / keybox against the SERVER in
 * the background and marks the session `verified` (writes wait for that); a real
 * downgrade — revoked device, rotated recovery key — locks the UI. When pass 1
 * already hit the network (cold start), it's authoritative and we mark verified
 * immediately.
 */
// True only while pass 2 (the background network revalidation) is in flight.
// Writes hold during this window (see sync.ts flush); once it resolves — verified
// or failed (offline) — the hold releases so writes are never stuck forever.
let cryptoRevalidating = false;
export function isCryptoRevalidating(): boolean {
  return cryptoRevalidating;
}

export async function bootstrapCrypto(): Promise<void> {
  useCryptoStore.getState().setVerified(false);
  await runBootstrap(false);
  const phase1 = useCryptoStore.getState().phase;
  if (vaultReadServedFromCache() && phase1 === "ready") {
    // Optimistic ready from cache → confirm against the server in the background.
    cryptoRevalidating = true;
    void runBootstrap(true).finally(() => {
      cryptoRevalidating = false;
      if (useCryptoStore.getState().phase === "ready") {
        useCryptoStore.getState().setVerified(true);
      }
    });
  } else if (phase1 === "ready") {
    // Pass 1 hit the network (cold) — already authoritative.
    useCryptoStore.getState().setVerified(true);
  }
}
