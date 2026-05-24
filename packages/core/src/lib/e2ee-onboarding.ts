/**
 * Per-vault, per-device acknowledgment that the user understands what
 * encryption costs them in a Git-backed vault. The first time anyone
 * tries to encrypt an item in a given vault we show a real modal with
 * the three irreversible facts:
 *
 *   - Prior plaintext versions stay in Git history forever
 *   - Only paired devices and the recovery phrase can decrypt
 *   - Losing the recovery phrase loses every encrypted item
 *
 * Once acknowledged for a vault, subsequent encrypts skip the gate —
 * the cost only needs to be made explicit once per (vault, device).
 *
 * Storage is intentionally just localStorage. This is a UX nudge, not
 * a security boundary; vaults that share a device share the same flag
 * scoped by the vault id.
 */

import { create } from "zustand";

const STORAGE_KEY = "nk:e2ee-ack";

type AckMap = Record<string, true>;

function readAck(): AckMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as AckMap;
    return {};
  } catch {
    return {};
  }
}

function writeAck(next: AckMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota errors, private-mode storage, etc. — fail open: the user
    // sees the dialog again next time, but encryption still works.
  }
}

export function hasAcknowledged(vaultId: string | null | undefined): boolean {
  if (!vaultId) return false;
  return readAck()[vaultId] === true;
}

export function acknowledge(vaultId: string): void {
  const ack = readAck();
  ack[vaultId] = true;
  writeAck(ack);
}

export type E2eeItemKind = "note" | "ticket" | "link";

interface PendingRequest {
  vaultId: string;
  kind: E2eeItemKind;
  title: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface E2eeOnboardingState {
  pending: PendingRequest | null;
  /**
   * Ask to encrypt an item. If the vault has already acknowledged the
   * warning, `onConfirm` runs immediately. Otherwise the dialog opens
   * and `onConfirm` only fires once the user accepts. Either way, the
   * caller doesn't have to think about state — it's all here.
   */
  requestEncrypt(req: PendingRequest): void;
  /** Called by the dialog when the user accepts. */
  confirm(): void;
  /** Called by the dialog when the user cancels or dismisses. */
  cancel(): void;
}

export const useE2eeOnboardingStore = create<E2eeOnboardingState>((set, get) => ({
  pending: null,
  requestEncrypt(req) {
    if (hasAcknowledged(req.vaultId)) {
      req.onConfirm();
      return;
    }
    set({ pending: req });
  },
  confirm() {
    const p = get().pending;
    set({ pending: null });
    if (!p) return;
    acknowledge(p.vaultId);
    p.onConfirm();
  },
  cancel() {
    const p = get().pending;
    set({ pending: null });
    p?.onCancel?.();
  },
}));
