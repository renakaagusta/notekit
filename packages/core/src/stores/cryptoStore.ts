import { create } from "zustand";
import type { DeviceIdentity } from "../lib/crypto/device-key";
import type { VaultKey } from "../lib/crypto/keybox";

export type CryptoPhase =
  | "idle"
  | "checking"
  | "needs-setup"
  | "needs-pair"
  | "waiting-approval"
  | "ready"
  | "error";

interface CryptoState {
  phase: CryptoPhase;
  device: DeviceIdentity | null;
  pairCode: string | null;
  error: string | null;
  /**
   * Vault encryption policy (born-E2EE). `true` = every item is sealed and the
   * per-item plaintext toggle is hidden. Loaded from `.notekit/config.json`
   * during bootstrap; defaults to `false` (legacy opt-in) until known.
   */
  encryptionRequired: boolean;
  /**
   * The unlocked vault key in envelope-mode vaults (content is sealed to it, and
   * it's wrapped per-device in the keybox). `null` in legacy vaults or before
   * the keybox is unlocked. Installed by bootstrapCrypto once the device is
   * `ready`. Mirrors the module-level seam in secrets-vault.ts (setActiveVaultKey).
   */
  vaultKey: VaultKey | null;
  /**
   * True once the crypto state has been confirmed against the SERVER this
   * session (not just served from the offline cache). Cache-first boot reaches
   * `ready` optimistically from cache, then a background network pass sets this.
   * Writes wait for it, so we never push to a vault whose trust root / device
   * membership we haven't revalidated online this session.
   */
  verified: boolean;
  setPhase(phase: CryptoPhase): void;
  setDevice(device: DeviceIdentity | null): void;
  setPairCode(code: string | null): void;
  setError(message: string | null): void;
  setEncryptionRequired(required: boolean): void;
  setVaultKey(vaultKey: VaultKey | null): void;
  setVerified(verified: boolean): void;
  reset(): void;
}

export const useCryptoStore = create<CryptoState>((set) => ({
  phase: "idle",
  device: null,
  pairCode: null,
  error: null,
  encryptionRequired: false,
  vaultKey: null,
  verified: false,
  setPhase: (phase) => set({ phase }),
  setDevice: (device) => set({ device }),
  setPairCode: (pairCode) => set({ pairCode }),
  setError: (error) => set({ error, phase: error ? "error" : "idle" }),
  setEncryptionRequired: (encryptionRequired) => set({ encryptionRequired }),
  setVaultKey: (vaultKey) => set({ vaultKey }),
  setVerified: (verified) => set({ verified }),
  reset: () =>
    set({ phase: "idle", device: null, pairCode: null, error: null, vaultKey: null, verified: false }),
}));
