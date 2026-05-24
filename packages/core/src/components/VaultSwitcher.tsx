import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  Pencil,
  Settings,
  Trash2,
  UserPlus,
} from "lucide-react";
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
import { VaultImportDialog } from "./VaultImportDialog";
import { VaultMembersDialog } from "./VaultMembersDialog";

interface VaultSwitcherProps {
  /** Optional callback fired after a successful switch (e.g. close any drawer). */
  onSwitched?(vault: VaultRef): void;
}

export function VaultSwitcher({ onSwitched }: VaultSwitcherProps) {
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
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsVault, setSettingsVault] = useState<VaultRef | null>(null);
  const [importDest, setImportDest] = useState<VaultRef | null>(null);
  const [membersVault, setMembersVault] = useState<VaultRef | null>(null);
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

  async function commitRename(id: string) {
    const label = renameLabel.trim() || null;
    setBusyId(id);
    try {
      const res = await vaultApi.patchVault(id, { label });
      upsertVault(res.vault);
      if (id === activeId) setVault(res.vault);
      setRenameId(null);
      setRenameLabel("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function commitDelete(id: string) {
    setBusyId(id);
    try {
      const res = await vaultApi.deleteVault(id);
      removeVault(id);
      setConfirmDelete(null);
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

  const triggerLabel = activeVault?.label
    ? activeVault.label
    : activeVault
      ? `${activeVault.owner}/${activeVault.repo}`
      : "No vault";

  return (
    <div className="nk-vault-switcher" ref={containerRef}>
      <button
        className="nk-vault-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch vault"
      >
        <span className="nk-vault-trigger-label">{triggerLabel}</span>
        <ChevronDown size={12} className="nk-vault-trigger-caret" aria-hidden />
      </button>

      {open && (
        <div className="nk-vault-menu" role="menu">
          <header className="nk-vault-menu-hd">Vaults</header>
          <ul className="nk-vault-list">
            {vaults.map((v) => {
              const isActive = v.id === activeId;
              const isRenaming = renameId === v.id;
              const isConfirming = confirmDelete === v.id;
              const isBusy = busyId === v.id;
              return (
                <li key={v.id} className={isActive ? "active" : ""}>
                  {!isRenaming && !isConfirming && (
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
                      <button
                        className="nk-iconbtn"
                        onClick={() => setMembersVault(v)}
                        title="Manage members"
                        aria-label="Members"
                        disabled={isBusy}
                      >
                        <UserPlus size={13} aria-hidden />
                      </button>
                      <button
                        className="nk-iconbtn"
                        onClick={() => setImportDest(v)}
                        title="Import from another vault"
                        aria-label="Import"
                        disabled={isBusy || vaults.length < 2}
                      >
                        <Download size={13} aria-hidden />
                      </button>
                      <button
                        className="nk-iconbtn"
                        onClick={() => {
                          setRenameId(v.id ?? null);
                          setRenameLabel(v.label ?? "");
                        }}
                        title="Rename"
                        aria-label="Rename"
                        disabled={isBusy}
                      >
                        <Pencil size={13} aria-hidden />
                      </button>
                      <button
                        className="nk-iconbtn"
                        onClick={() => setConfirmDelete(v.id ?? null)}
                        title="Unregister"
                        aria-label="Unregister"
                        disabled={isBusy}
                      >
                        <Trash2 size={13} aria-hidden />
                      </button>
                    </div>
                  )}
                  {isRenaming && (
                    <form
                      className="nk-vault-rename"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (v.id) commitRename(v.id);
                      }}
                    >
                      <input
                        autoFocus
                        type="text"
                        value={renameLabel}
                        onChange={(e) => setRenameLabel(e.target.value)}
                        placeholder={`${v.owner}/${v.repo}`}
                      />
                      <button
                        type="submit"
                        className="nk-vault-rename-save"
                        disabled={isBusy}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="nk-vault-rename-cancel"
                        onClick={() => {
                          setRenameId(null);
                          setRenameLabel("");
                        }}
                      >
                        Cancel
                      </button>
                    </form>
                  )}
                  {isConfirming && (
                    <div className="nk-vault-confirm">
                      <p>
                        Unregister <b>{v.label || `${v.owner}/${v.repo}`}</b>?
                        The underlying{" "}
                        {v.provider === "gitlab"
                          ? "GitLab project"
                          : v.provider === "notekit"
                            ? "NoteKit Git repo"
                            : "GitHub repo"}{" "}
                        is left untouched.
                      </p>
                      <div className="nk-vault-confirm-actions">
                        <button
                          className="nk-vault-confirm-yes"
                          onClick={() => v.id && commitDelete(v.id)}
                          disabled={isBusy}
                        >
                          Unregister
                        </button>
                        <button
                          className="nk-vault-confirm-no"
                          onClick={() => setConfirmDelete(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
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
        />
      )}

      {importDest && (
        <VaultImportDialog
          dest={importDest}
          vaults={vaults}
          onClose={() => setImportDest(null)}
        />
      )}

      {membersVault && (
        <VaultMembersDialog
          vault={membersVault}
          onClose={() => setMembersVault(null)}
        />
      )}
    </div>
  );
}
