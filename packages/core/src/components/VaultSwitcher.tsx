import { useEffect, useRef, useState } from "react";
import { ChevronDown, FolderGit2, Settings } from "lucide-react";
import { useVaultStore } from "../stores/vaultStore";
import type { VaultRef } from "../lib/vault-api";
import * as vaultApi from "../lib/vault-api";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { reset as resetSync, start as startSync } from "../lib/sync";
import {
  bindVaultPersistence,
  unbindVaultPersistence,
} from "../lib/vault-persistence";
import {
  startVaultEventStream,
  stopVaultEventStream,
} from "../lib/vault-events-client";
import { AddVaultDialog } from "./AddVaultDialog";
import { VaultSettingsDialog } from "./VaultSettingsDialog";

interface VaultSwitcherProps {
  /** Optional callback fired after a successful switch (e.g. close any drawer). */
  onSwitched?(vault: VaultRef): void;
  /** Extra class on the root — e.g. "nk-vault-switcher--footer" to open the
   *  menu upward when the switcher sits at the bottom of the sidebar. */
  className?: string;
}

export function VaultSwitcher({ onSwitched, className }: VaultSwitcherProps) {
  const vaults = useVaultStore((s) => s.vaults);
  const activeId = useVaultStore((s) => s.activeId);
  const activeVault = useVaultStore((s) => s.vault);
  const setVaults = useVaultStore((s) => s.setVaults);
  const upsertVault = useVaultStore((s) => s.upsertVault);
  const removeVault = useVaultStore((s) => s.removeVault);
  const setActiveId = useVaultStore((s) => s.setActiveId);
  const setVault = useVaultStore((s) => s.setVault);
  const setPhase = useVaultStore((s) => s.setPhase);
  const setError = useVaultStore((s) => s.setError);

  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsVault, setSettingsVault] = useState<VaultRef | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function switchTo(vault: VaultRef) {
    if (!vault.id || vault.id === activeId) {
      setOpen(false);
      return;
    }
    setBusyId(vault.id);
    setPhase("switching");
    try {
      // Tear down the sync engine + clear in-memory stores so the new vault's
      // pull cannot collide with the previous vault's queued writes.
      // Also close the SSE stream — the server resolves the channel by
      // active-vault at connect time, so we need a fresh connection for the
      // new vault to receive its events.
      stopVaultEventStream();
      resetSync();
      useNotesStore.getState().replaceAll([]);
      useTicketsStore.getState().replaceAll([]);
      useNotesStore.setState({ activeNoteId: null, draftJournal: null });

      const res = await vaultApi.selectVaultById(vault.id);
      setActiveId(res.activeId);
      setVault(res.vault);
      // Rebind localStorage persistence to the new vault before sync starts
      // so the previous vault's saved state isn't pushed into this one.
      await bindVaultPersistence(res.vault);
      await startSync();
      startVaultEventStream();
      onSwitched?.(res.vault);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function commitRename(id: string, label: string | null) {
    setBusyId(id);
    try {
      const res = await vaultApi.patchVault(id, { label });
      upsertVault(res.vault);
      if (id === activeId) setVault(res.vault);
      // Keep the open settings dialog in sync with the new label.
      setSettingsVault((cur) => (cur && cur.id === id ? res.vault : cur));
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusyId(null);
    }
  }

  async function commitDelete(id: string) {
    setBusyId(id);
    try {
      const res = await vaultApi.deleteVault(id);
      removeVault(id);
      // If the server picked a different active vault for us, switch the
      // client over to it (full reset + pull).
      if (res.activeId && res.activeId !== activeId) {
        const next = vaults.find((v) => v.id === res.activeId);
        if (next) {
          await switchTo(next);
          return;
        }
      } else if (!res.activeId) {
        // No vaults left.
        stopVaultEventStream();
        resetSync();
        useNotesStore.getState().replaceAll([]);
        useTicketsStore.getState().replaceAll([]);
        unbindVaultPersistence();
        setVault(null);
        setPhase("needs-pick");
      }
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusyId(null);
    }
  }

  async function refreshList() {
    try {
      const res = await vaultApi.listVaults();
      setVaults(res.vaults, res.activeId);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onAdded(vault: VaultRef) {
    setAddOpen(false);
    // Server already activated the new vault. Refresh list, then switch.
    await refreshList();
    await switchTo(vault);
  }

  // The trigger shows just the repo (or a truly custom label) so it
  // fits the 240px sidebar without truncation. The full `owner/repo` is
  // still surfaced — in the trigger's `title` tooltip and in every row
  // of the switcher popover — so users who care about the owner can
  // always reach it.
  //
  // Server-side, `vault.label` defaults to the synthetic `owner/repo`
  // string at create time, so we need to detect that case and trim it;
  // a label that's anything OTHER than `owner/repo` is treated as a
  // real user-customized name and respected as-is.
  const triggerLabel = (() => {
    if (!activeVault) return "No vault";
    const synthetic = `${activeVault.owner}/${activeVault.repo}`;
    if (!activeVault.label || activeVault.label === synthetic) {
      return activeVault.repo;
    }
    return activeVault.label;
  })();
  const triggerTooltip = activeVault
    ? `${activeVault.owner}/${activeVault.repo} — switch vault`
    : "Switch vault";

  return (
    <div
      className={"nk-vault-switcher" + (className ? ` ${className}` : "")}
      ref={containerRef}
    >
      <button
        className="nk-vault-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={triggerTooltip}
      >
        <span className="nk-vault-mark" aria-hidden>
          <FolderGit2 size={12} />
        </span>
        <span className="nk-vault-trigger-label">{triggerLabel}</span>
        <ChevronDown size={12} className="nk-vault-trigger-caret" aria-hidden />
      </button>

      {open && (
        <div className="nk-vault-menu" role="menu">
          <header className="nk-vault-menu-hd">Vaults</header>
          <ul className="nk-vault-list">
            {vaults.map((v) => {
              const isActive = v.id === activeId;
              const isBusy = busyId === v.id;
              return (
                <li key={v.id} className={isActive ? "active" : ""}>
                  <div className="nk-vault-row">
                    <button
                      className="nk-vault-pick"
                      onClick={() => switchTo(v)}
                      disabled={isBusy}
                    >
                      <span className="nk-vault-row-label">
                        {v.label || `${v.owner}/${v.repo}`}
                        {v.provider === "notekit" && (
                          <span className="nk-chip nk-chip--soft" title="NoteKit Git">
                            NK
                          </span>
                        )}
                        {v.provider === "gitlab" && (
                          <span className="nk-chip nk-chip--soft" title="GitLab">
                            GL
                          </span>
                        )}
                        {isActive && (
                          <span className="nk-vault-active-mark" aria-label="Active">
                            ●
                          </span>
                        )}
                      </span>
                      <span className="nk-vault-row-sub">
                        {v.owner}/{v.repo}
                        {v.branch && v.branch !== "main" ? ` · ${v.branch}` : ""}
                      </span>
                    </button>
                    <button
                      className="nk-iconbtn"
                      onClick={() => setSettingsVault(v)}
                      title="Settings"
                      aria-label="Settings"
                      disabled={isBusy}
                    >
                      <Settings size={13} aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
            {vaults.length === 0 && (
              <li className="nk-vault-empty">No vaults yet.</li>
            )}
          </ul>
          <footer className="nk-vault-menu-ft">
            <button
              className="nk-vault-add"
              onClick={() => {
                setAddOpen(true);
                setOpen(false);
              }}
            >
              + Add a vault
            </button>
          </footer>
        </div>
      )}

      {addOpen && (
        <AddVaultDialog
          onAdded={onAdded}
          onCancel={() => setAddOpen(false)}
        />
      )}

      {settingsVault && (
        <VaultSettingsDialog
          vault={settingsVault}
          onClose={() => setSettingsVault(null)}
          onSaved={(saved) => {
            // Settings stored centrally so App can react (theme, default folder).
            if (settingsVault.id) {
              useVaultStore.getState().setSettingsFor(settingsVault.id, saved);
            }
          }}
          onRename={commitRename}
          onDelete={commitDelete}
        />
      )}
    </div>
  );
}
