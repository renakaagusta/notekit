import { useEffect } from "react";
import {
  getStatus as getVaultStatus,
  listVaults,
} from "../adapters/driven/vault-api";
import { startVaultEventStream } from "../adapters/driven/vault-events-client";
import {
  start as startSync,
  pull as pullSync,
} from "../composition/vault-sync";
import type { VaultRef, VaultStatus } from "../domain/entities/vault";
import { bootstrapCrypto } from "../lib/crypto-bootstrap";
import { bindVaultPersistence } from "../lib/vault-persistence";
import { useCryptoStore } from "../stores/cryptoStore";
import { useSyncStore } from "../stores/syncStore";
import type { VaultPhase } from "../stores/vaultStore";

async function rehydrateEncryptedIfSkipped(): Promise<void> {
  const skipped = useSyncStore.getState().encryptedSkipped;
  const total = skipped.notes + skipped.tickets + skipped.links;
  if (total === 0) return;
  if (!useCryptoStore.getState().device?.identity) return;
  await pullSync();
}

function readLastVault(): VaultRef | null {
  try {
    const raw = localStorage.getItem("nk:last-vault");
    if (!raw) return null;
    const v = JSON.parse(raw) as VaultRef;
    return v && v.owner && v.repo ? v : null;
  } catch {
    return null;
  }
}

interface VaultBootHandlers {
  setVault: (vault: VaultRef | null) => void;
  setVaults: (vaults: VaultRef[], activeId: string | null) => void;
  setVaultPhase: (phase: VaultPhase) => void;
  setVaultError: (error: string | null) => void;
}

export function useVaultBoot({
  setVault,
  setVaults,
  setVaultPhase,
  setVaultError,
}: VaultBootHandlers) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let status: VaultStatus;
        try {
          status = await getVaultStatus();
          if (status.configured && status.vault) {
            try {
              localStorage.setItem("nk:last-vault", JSON.stringify(status.vault));
            } catch {
              /* ignore */
            }
          }
        } catch (statusErr) {
          const cachedVault = readLastVault();
          if (!cachedVault) throw statusErr;
          status = { configured: true, hasGithubToken: true, vault: cachedVault };
        }
        if (cancelled) return;
        if (status.configured && status.vault) {
          setVault(status.vault);
          listVaults()
            .then((res) => {
              if (!cancelled) setVaults(res.vaults, res.activeId);
            })
            .catch(() => {
              /* Switcher will retry on next open; not fatal. */
            });
          await bindVaultPersistence(status.vault);
          // Wait for crypto before pull so encrypted items decrypt on first try.
          // Tolerate failure so content loads regardless.
          await bootstrapCrypto().catch(() => { /* intentional noop */ });
          await startSync();
          startVaultEventStream();
          await rehydrateEncryptedIfSkipped();
        } else if (status.hasGithubToken) {
          setVaultPhase("needs-pick");
        } else {
          setVaultPhase("needs-token");
        }
      } catch (e) {
        if (!cancelled) setVaultError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setVault, setVaults, setVaultPhase, setVaultError]);
}

export { rehydrateEncryptedIfSkipped };
