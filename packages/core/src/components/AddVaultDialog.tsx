import { useEffect, useState } from "react";
import { Diamond, Github, Plus, X } from "lucide-react";
import * as vaultApi from "../lib/vault-api";
import { SkeletonRepoList } from "./Skeleton";
import type { VaultRef, VaultRepo } from "../lib/vault-api";

type Mode = "list" | "create" | "notekit";
type NotekitStep = "idle" | "provisioning" | "ready";

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

  // NoteKit Git state
  const [notekitStep, setNotekitStep] = useState<NotekitStep>("idle");
  const [notekitUsername, setNotekitUsername] = useState<string | null>(null);
  const [notekitRepos, setNotekitRepos] = useState<VaultRepo[] | null>(null);
  const [notekitName, setNotekitName] = useState("vault");
  const [notekitPrivate, setNotekitPrivate] = useState(true);
  const [notekitMode, setNotekitMode] = useState<"list" | "create">("list");

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

  // Provision Forgejo account when switching to notekit tab.
  useEffect(() => {
    if (mode !== "notekit" || notekitStep !== "idle") return;
    let cancelled = false;
    setNotekitStep("provisioning");
    setLoadErr(null);
    vaultApi
      .provisionNotekit()
      .then((res) => {
        if (cancelled) return;
        setNotekitUsername(res.username);
        setNotekitStep("ready");
        return vaultApi.listNotekitRepos();
      })
      .then((r) => {
        if (!cancelled && r) setNotekitRepos(r.repos);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setLoadErr(e.message);
          setNotekitStep("idle");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, notekitStep]);

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

  async function pickNotekit(repo: VaultRepo) {
    setBusy(true);
    setLoadErr(null);
    try {
      const res = await vaultApi.addVault({
        provider: "notekit",
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

  async function createAndPickNotekit() {
    setBusy(true);
    setLoadErr(null);
    try {
      const created = await vaultApi.createNotekitRepo(notekitName, notekitPrivate);
      const res = await vaultApi.addVault({
        provider: "notekit",
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
          <X size={16} aria-hidden />
        </button>

        <div className="nk-modal-tabs">
          <button
            className={mode === "list" ? "active" : ""}
            onClick={() => setMode("list")}
          >
            <Github size={14} className="nk-modal-tab-icon" aria-hidden />
            GitHub · existing
          </button>
          <button
            className={mode === "create" ? "active" : ""}
            onClick={() => setMode("create")}
          >
            <Plus size={14} className="nk-modal-tab-icon" aria-hidden />
            GitHub · new
          </button>
          <button
            className={mode === "notekit" ? "active" : ""}
            onClick={() => setMode("notekit")}
            title="NoteKit-hosted Git via Forgejo"
          >
            <Diamond size={14} className="nk-modal-tab-icon" aria-hidden />
            NoteKit Git
          </button>
        </div>

        {loadErr && <div className="nk-modal-error">{loadErr}</div>}

        {mode === "list" && (
          <div className="nk-modal-body">
            {!repos && !loadErr && <SkeletonRepoList count={5} />}
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

        {mode === "notekit" && (
          <div className="nk-modal-body">
            {notekitStep === "provisioning" && (
              <p className="nk-empty-hint">Setting up your NoteKit Git account…</p>
            )}

            {notekitStep === "ready" && (
              <>
                <div className="nk-modal-tabs" style={{ marginBottom: 12 }}>
                  <button
                    className={notekitMode === "list" ? "active" : ""}
                    onClick={() => setNotekitMode("list")}
                    style={{ fontSize: 13 }}
                  >
                    Existing repo
                  </button>
                  <button
                    className={notekitMode === "create" ? "active" : ""}
                    onClick={() => setNotekitMode("create")}
                    style={{ fontSize: 13 }}
                  >
                    Create new repo
                  </button>
                </div>

                {notekitMode === "list" && (
                  <>
                    {!notekitRepos && <SkeletonRepoList count={3} />}
                    {notekitRepos && notekitRepos.length === 0 && (
                      <p className="nk-empty-hint">No repos yet. Create one.</p>
                    )}
                    {notekitRepos && notekitRepos.length > 0 && (
                      <ul className="nk-repo-list">
                        {notekitRepos.map((r) => (
                          <li key={r.id}>
                            <button
                              className="nk-repo-row"
                              onClick={() => pickNotekit(r)}
                              disabled={busy}
                            >
                              <div className="nk-repo-row-main">
                                <span className="nk-repo-name">{r.fullName}</span>
                                {r.private && <span className="nk-chip">private</span>}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {notekitMode === "create" && (
                  <>
                    <p className="nk-empty-hint" style={{ marginBottom: 12 }}>
                      Stored on NoteKit's self-hosted Forgejo as{" "}
                      <code>{notekitUsername}/{notekitName}</code>.
                    </p>
                    <label className="nk-field">
                      <span>Repo name</span>
                      <input
                        type="text"
                        value={notekitName}
                        onChange={(e) => setNotekitName(e.target.value)}
                        disabled={busy}
                        placeholder="vault"
                      />
                    </label>
                    <label className="nk-field nk-field--row">
                      <input
                        type="checkbox"
                        checked={notekitPrivate}
                        onChange={(e) => setNotekitPrivate(e.target.checked)}
                        disabled={busy}
                      />
                      <span>Make repo private (recommended)</span>
                    </label>
                    <button
                      className="nk-signin-btn"
                      onClick={createAndPickNotekit}
                      disabled={busy || !notekitName.trim()}
                    >
                      {busy ? "Creating…" : "Create and use this repo"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
