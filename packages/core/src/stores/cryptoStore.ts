import { create } from "zustand";
import type { DeviceIdentity } from "../lib/crypto/device-key";

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
  setPhase(phase: CryptoPhase): void;
  setDevice(device: DeviceIdentity | null): void;
  setPairCode(code: string | null): void;
  setError(message: string | null): void;
  setEncryptionRequired(required: boolean): void;
  reset(): void;
}

export const useCryptoStore = create<CryptoState>((set) => ({
  phase: "idle",
  device: null,
  pairCode: null,
  error: null,
  encryptionRequired: false,
  setPhase: (phase) => set({ phase }),
  setDevice: (device) => set({ device }),
  setPairCode: (pairCode) => set({ pairCode }),
  setError: (error) => set({ error, phase: error ? "error" : "idle" }),
  setEncryptionRequired: (encryptionRequired) => set({ encryptionRequired }),
  reset: () =>
    set({ phase: "idle", device: null, pairCode: null, error: null }),
}));
