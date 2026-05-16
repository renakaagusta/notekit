import { useEffect, useState } from "react";
import * as vaultApi from "../lib/vault-api";
import type { VaultRef, VaultRepo } from "../lib/vault-api";

type Mode = "list" | "create";

interface AddVaultDialogProps {
  onAdded(vault: VaultRef): void;
  onCancel(): void;
}

export function AddVaultDialog({ onAdded, onCancel }: AddVaultDialogProps) {
  const [mode, setMode] = useState<Mode>("list");
  const [repos, setRepos] = useState<VaultRepo[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("notekit-vault");
  const [newPrivate, setNewPrivate] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadErr(null);
    vaultApi
      .listRepos()
      .then((r) => {
        if (!cancelled) setRepos(r.repos);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(repo: VaultRepo) {
    setBusy(true);
    setLoadErr(null);
    try {
      const res = await vaultApi.addVault({
        provider: "github",
        owner: repo.owner,
        repo: repo.name,
        branch: repo.defaultBranch,
      });
      onAdded(res.vault);
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createAndPick() {
    setBusy(true);
    setLoadErr(null);
    try {
      const created = await vaultApi.createRepo(newName, newPrivate);
      const res = await vaultApi.addVault({
        provider: "github",
        owner: created.repo.owner,
        repo: created.repo.name,
        branch: created.repo.defaultBranch,
      });
      onAdded(res.vault);
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nk-modal-backdrop" onClick={onCancel}>
      <div className="nk-modal" onClick={(e) => e.stopPropagation()}>
        <header className="nk-modal-hd">
          <h2>Add a vault</h2>
          <p className="nk-modal-sub">
            Each vault is a workspace backed by exactly one Git repo.
            Switch between them any time.
          </p>
        </header>
        <button
          className="nk-modal-close nk-iconbtn"
          onClick={onCancel}
          aria-label="Close"
          title="Close"
        >
          ×
        </button>

        <div className="nk-modal-tabs">
          <button
            className={mode === "list" ? "active" : ""}
            onClick={() => setMode("list")}
          >
            Use existing repo
          </button>
          <button
            className={mode === "create" ? "active" : ""}
            onClick={() => setMode("create")}
          >
            Create new repo
          </button>
          <button className="disabled" disabled title="Coming soon">
            NoteKit Git (soon)
          </button>
        </div>

        {loadErr && <div className="nk-modal-error">{loadErr}</div>}

        {mode === "list" && (
          <div className="nk-modal-body">
            {!repos && !loadErr && (
              <p className="nk-empty-hint">Loading repos…</p>
            )}
            {repos && repos.length === 0 && (
              <p className="nk-empty-hint">
                No repos found. Create a new one instead.
              </p>
            )}
            {repos && repos.length > 0 && (
              <ul className="nk-repo-list">
                {repos.map((r) => (
                  <li key={r.id}>
                    <button
                      className="nk-repo-row"
                      onClick={() => pick(r)}
                      disabled={busy}
                    >
                      <div className="nk-repo-row-main">
                        <span className="nk-repo-name">{r.fullName}</span>
                        {r.private && <span className="nk-chip">private</span>}
                      </div>
                      {r.description && (
                        <div className="nk-repo-desc">{r.description}</div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {mode === "create" && (
          <div className="nk-modal-body">
            <label className="nk-field">
              <span>Repo name</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={busy}
                placeholder="notekit-vault"
              />
            </label>
            <label className="nk-field nk-field--row">
              <input
                type="checkbox"
                checked={newPrivate}
                onChange={(e) => setNewPrivate(e.target.checked)}
                disabled={busy}
              />
              <span>Make repo private (recommended)</span>
            </label>
            <button
              className="nk-signin-btn"
              onClick={createAndPick}
              disabled={busy || !newName.trim()}
            >
              {busy ? "Creating…" : "Create and use this repo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
