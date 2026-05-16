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
  setPhase(phase: CryptoPhase): void;
  setDevice(device: DeviceIdentity | null): void;
  setPairCode(code: string | null): void;
  setError(message: string | null): void;
  reset(): void;
}

export const useCryptoStore = create<CryptoState>((set) => ({
  phase: "idle",
  device: null,
  pairCode: null,
  error: null,
  setPhase: (phase) => set({ phase }),
  setDevice: (device) => set({ device }),
  setPairCode: (pairCode) => set({ pairCode }),
  setError: (error) => set({ error, phase: error ? "error" : "idle" }),
  reset: () =>
    set({ phase: "idle", device: null, pairCode: null, error: null }),
}));
