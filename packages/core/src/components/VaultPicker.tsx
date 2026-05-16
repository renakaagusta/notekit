import { useEffect, useState } from "react";
import * as vaultApi from "../lib/vault-api";
import type { VaultRepo } from "../lib/vault-api";
import { useVaultStore } from "../stores/vaultStore";

type Mode = "list" | "create";

interface VaultPickerProps {
  onPicked(): void;
}

export function VaultPicker({ onPicked }: VaultPickerProps) {
  const setVault = useVaultStore((s) => s.setVault);
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
    try {
      const res = await vaultApi.selectVault(
        repo.owner,
        repo.name,
        repo.defaultBranch,
      );
      setVault(res.vault);
      onPicked();
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
      const res = await vaultApi.selectVault(
        created.repo.owner,
        created.repo.name,
        created.repo.defaultBranch,
      );
      setVault(res.vault);
      onPicked();
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nk-modal-backdrop">
      <div className="nk-modal">
        <header className="nk-modal-hd">
          <h2>Pick your vault</h2>
          <p className="nk-modal-sub">
            NoteKit stores notes and tickets in a GitHub repo you own.
            You can change this later.
          </p>
        </header>

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
        </div>

        {loadErr && (
          <div className="nk-modal-error">
            {loadErr}
          </div>
        )}

        {mode === "list" && (
          <div className="nk-modal-body">
            {!repos && !loadErr && <p className="nk-empty-hint">Loading repos…</p>}
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
                        {r.private && (
                          <span className="nk-chip">private</span>
                        )}
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
