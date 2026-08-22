import type { VaultRef } from "../adapters/driven/vault-api";

export function readLastVault(): VaultRef | null {
  try {
    const raw = localStorage.getItem("nk:last-vault");
    if (!raw) return null;
    const v = JSON.parse(raw) as VaultRef;
    return v && v.owner && v.repo ? v : null;
  } catch {
    return null;
  }
}

export function noteCounter(body: string): string {
  // body can be undefined for a note hydrated from localStorage before its
  // E2EE content decrypts (partialize strips body/title). Guard so the counter
  // renders empty rather than crashing the whole view.
  const chars = body?.length ?? 0;
  if (chars === 0) return "";
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  const fmt = new Intl.NumberFormat();
  return `${fmt.format(words)} ${words === 1 ? "word" : "words"} · ${fmt.format(chars)} ${chars === 1 ? "char" : "chars"}`;
}

export function syncLabel(
  phase: string,
  lastSyncedAt: string | null,
  vaultPhase: string,
  vaultLabel: string,
): string {
  if (vaultPhase === "needs-token") return "Set up a vault to sync";
  if (vaultPhase === "needs-pick") return "Pick a vault repo";
  if (phase === "fetching") return "Pulling…";
  if (phase === "pushing") return "Syncing…";
  if (phase === "error") return "Sync error";
  if (lastSyncedAt) {
    return `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}`;
  }
  return vaultLabel;
}

export function syncTone(
  phase: string,
  lastSyncedAt: string | null,
  vaultPhase: string,
): "idle" | "sync" | "error" | "ready" {
  if (vaultPhase === "needs-token" || vaultPhase === "needs-pick") return "idle";
  if (phase === "error") return "error";
  if (phase === "fetching" || phase === "pushing") return "sync";
  if (lastSyncedAt) return "ready";
  return "idle";
}
