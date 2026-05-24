/**
 * Onboarding-gate tests. Verifies the per-vault ack flag persists and
 * that `requestEncrypt` short-circuits when the user has already opted
 * in for the active vault.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acknowledge,
  hasAcknowledged,
  useE2eeOnboardingStore,
} from "./e2ee-onboarding";

// Minimal in-memory localStorage shim so the helpers run in vitest's
// node environment without bringing in jsdom.
function installLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

beforeEach(() => {
  installLocalStorage();
  localStorage.clear();
  useE2eeOnboardingStore.setState({ pending: null });
});

describe("hasAcknowledged / acknowledge", () => {
  it("starts false for an unknown vault", () => {
    expect(hasAcknowledged("vault-x")).toBe(false);
  });

  it("returns true once a vault has acknowledged", () => {
    acknowledge("vault-x");
    expect(hasAcknowledged("vault-x")).toBe(true);
  });

  it("is scoped per-vault", () => {
    acknowledge("vault-x");
    expect(hasAcknowledged("vault-y")).toBe(false);
  });

  it("survives a JSON round-trip", () => {
    acknowledge("vault-x");
    acknowledge("vault-y");
    // Force a re-read by clearing in-memory state.
    expect(hasAcknowledged("vault-x")).toBe(true);
    expect(hasAcknowledged("vault-y")).toBe(true);
  });

  it("falls back gracefully if localStorage holds garbage", () => {
    localStorage.setItem("nk:e2ee-ack", "not json");
    expect(hasAcknowledged("vault-x")).toBe(false);
    // Subsequent writes still work.
    acknowledge("vault-x");
    expect(hasAcknowledged("vault-x")).toBe(true);
  });
});

describe("useE2eeOnboardingStore.requestEncrypt", () => {
  it("calls onConfirm immediately when the vault has already acknowledged", () => {
    acknowledge("vault-x");
    const onConfirm = vi.fn();
    useE2eeOnboardingStore.getState().requestEncrypt({
      vaultId: "vault-x",
      kind: "note",
      title: "Hello",
      onConfirm,
    });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(useE2eeOnboardingStore.getState().pending).toBeNull();
  });

  it("queues a pending request when the vault hasn't acknowledged yet", () => {
    const onConfirm = vi.fn();
    useE2eeOnboardingStore.getState().requestEncrypt({
      vaultId: "vault-x",
      kind: "ticket",
      title: "Fire client X",
      onConfirm,
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(useE2eeOnboardingStore.getState().pending).toMatchObject({
      vaultId: "vault-x",
      kind: "ticket",
      title: "Fire client X",
    });
  });

  it("confirm() acknowledges the vault and fires the callback", () => {
    const onConfirm = vi.fn();
    useE2eeOnboardingStore.getState().requestEncrypt({
      vaultId: "vault-x",
      kind: "link",
      title: "Therapy booking",
      onConfirm,
    });
    useE2eeOnboardingStore.getState().confirm();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(hasAcknowledged("vault-x")).toBe(true);
    expect(useE2eeOnboardingStore.getState().pending).toBeNull();
  });

  it("cancel() does not acknowledge and does not fire onConfirm", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    useE2eeOnboardingStore.getState().requestEncrypt({
      vaultId: "vault-x",
      kind: "note",
      title: "Hi",
      onConfirm,
      onCancel,
    });
    useE2eeOnboardingStore.getState().cancel();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(hasAcknowledged("vault-x")).toBe(false);
    expect(useE2eeOnboardingStore.getState().pending).toBeNull();
  });

  it("a second encrypt in the same vault after confirm skips the gate", () => {
    const first = vi.fn();
    useE2eeOnboardingStore.getState().requestEncrypt({
      vaultId: "vault-x",
      kind: "note",
      title: "First",
      onConfirm: first,
    });
    useE2eeOnboardingStore.getState().confirm();

    const second = vi.fn();
    useE2eeOnboardingStore.getState().requestEncrypt({
      vaultId: "vault-x",
      kind: "note",
      title: "Second",
      onConfirm: second,
    });
    expect(second).toHaveBeenCalledOnce();
    expect(useE2eeOnboardingStore.getState().pending).toBeNull();
  });
});
