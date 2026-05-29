import { useEffect, useState } from "react";
import { X } from "lucide-react";
import * as vaultApi from "../lib/vault-api";
import { SkeletonRepoList } from "./Skeleton";
import { GithubIcon, GitlabIcon, NotekitIcon } from "./BrandIcons";
import type { VaultRef, VaultRepo } from "../lib/vault-api";

type Provider = "github" | "gitlab" | "notekit";
type SubMode = "list" | "create";
type NotekitStep = "idle" | "provisioning" | "ready";
type GitlabStep = "idle" | "checking" | "needs-connect" | "ready";

interface AddVaultDialogProps {
  onAdded(vault: VaultRef): void;
  onCancel(): void;
}

export function AddVaultDialog({ onAdded, onCancel }: AddVaultDialogProps) {
  const [provider, setProvider] = useState<Provider>("github");
  const [githubMode, setGithubMode] = useState<SubMode>("list");
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

  // GitLab state
  const [gitlabStep, setGitlabStep] = useState<GitlabStep>("idle");
  const [gitlabLogin, setGitlabLogin] = useState<string | null>(null);
  const [gitlabRepos, setGitlabRepos] = useState<VaultRepo[] | null>(null);
  const [gitlabPat, setGitlabPat] = useState("");
  const [gitlabName, setGitlabName] = useState("notekit-vault");
  const [gitlabPrivate, setGitlabPrivate] = useState(true);
  const [gitlabMode, setGitlabMode] = useState<"list" | "create">("list");

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
    if (provider !== "notekit" || notekitStep !== "idle") return;
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
  }, [provider, notekitStep]);

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

  // Check GitLab connection state when entering the tab.
  useEffect(() => {
    if (provider !== "gitlab" || gitlabStep !== "idle") return;
    let cancelled = false;
    setGitlabStep("checking");
    setLoadErr(null);
    vaultApi
      .getGitlabStatus()
      .then((res) => {
        if (cancelled) return;
        if (!res.connected) {
          setGitlabStep("needs-connect");
          return;
        }
        setGitlabLogin(res.login);
        setGitlabStep("ready");
        return vaultApi.listGitlabRepos();
      })
      .then((r) => {
        if (!cancelled && r) setGitlabRepos(r.repos);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setLoadErr(e.message);
          setGitlabStep("needs-connect");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [provider, gitlabStep]);

  async function connectGitlab() {
    if (!gitlabPat.trim()) return;
    setBusy(true);
    setLoadErr(null);
    try {
      const res = await vaultApi.connectGitlab(gitlabPat.trim());
      setGitlabLogin(res.login);
      setGitlabPat("");
      setGitlabStep("ready");
      const list = await vaultApi.listGitlabRepos();
      setGitlabRepos(list.repos);
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pickGitlab(repo: VaultRepo) {
    setBusy(true);
    setLoadErr(null);
    try {
      const res = await vaultApi.addVault({
        provider: "gitlab",
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

  async function createAndPickGitlab() {
    setBusy(true);
    setLoadErr(null);
    try {
      const created = await vaultApi.createGitlabRepo(gitlabName, gitlabPrivate);
      const res = await vaultApi.addVault({
        provider: "gitlab",
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
            className={provider === "github" ? "active" : ""}
            onClick={() => setProvider("github")}
            title="GitHub"
          >
            <GithubIcon size={14} className="nk-modal-tab-icon" />
            GitHub
          </button>
          <button
            className={provider === "gitlab" ? "active" : ""}
            onClick={() => setProvider("gitlab")}
            title="GitLab (bring your own)"
          >
            <GitlabIcon size={14} className="nk-modal-tab-icon" />
            GitLab
          </button>
          <button
            className={provider === "notekit" ? "active" : ""}
            onClick={() => setProvider("notekit")}
            title="NoteKit-hosted Git via Forgejo"
          >
            <NotekitIcon size={14} className="nk-modal-tab-icon" />
            NoteKit Git
          </button>
        </div>

        {loadErr && <div className="nk-modal-error">{loadErr}</div>}

        {provider === "github" && (
          <div className="nk-modal-body">
            <div className="nk-modal-tabs nk-modal-tabs--sub">
              <button
                className={githubMode === "list" ? "active" : ""}
                onClick={() => setGithubMode("list")}
              >
                Existing repo
              </button>
              <button
                className={githubMode === "create" ? "active" : ""}
                onClick={() => setGithubMode("create")}
              >
                Create new repo
              </button>
            </div>

            {githubMode === "list" && (
              <>
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
              </>
            )}

            {githubMode === "create" && (
              <>
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
              </>
            )}
          </div>
        )}

        {provider === "gitlab" && (
          <div className="nk-modal-body">
            {gitlabStep === "checking" && (
              <p className="nk-empty-hint">Checking GitLab connection…</p>
            )}

            {gitlabStep === "needs-connect" && (
              <>
                <p className="nk-empty-hint" style={{ marginBottom: 12 }}>
                  Paste a GitLab Personal Access Token to connect. Scopes
                  needed: <code>api</code> and <code>write_repository</code>.
                  Create one at{" "}
                  <a
                    href="https://gitlab.com/-/user_settings/personal_access_tokens"
                    target="_blank"
                    rel="noreferrer"
                  >
                    gitlab.com/-/user_settings/personal_access_tokens
                  </a>
                  .
                </p>
                <label className="nk-field">
                  <span>Personal access token</span>
                  <input
                    type="password"
                    value={gitlabPat}
                    onChange={(e) => setGitlabPat(e.target.value)}
                    disabled={busy}
                    placeholder="glpat-…"
                    autoComplete="off"
                  />
                </label>
                <button
                  className="nk-signin-btn"
                  onClick={connectGitlab}
                  disabled={busy || !gitlabPat.trim()}
                >
                  {busy ? "Connecting…" : "Connect GitLab"}
                </button>
              </>
            )}

            {gitlabStep === "ready" && (
              <>
                <p
                  className="nk-empty-hint"
                  style={{ marginBottom: 12, fontSize: 12 }}
                >
                  Connected as <code>{gitlabLogin}</code> on gitlab.com.
                </p>
                <div className="nk-modal-tabs nk-modal-tabs--sub">
                  <button
                    className={gitlabMode === "list" ? "active" : ""}
                    onClick={() => setGitlabMode("list")}
                  >
                    Existing project
                  </button>
                  <button
                    className={gitlabMode === "create" ? "active" : ""}
                    onClick={() => setGitlabMode("create")}
                  >
                    Create new project
                  </button>
                </div>

                {gitlabMode === "list" && (
                  <>
                    {!gitlabRepos && <SkeletonRepoList count={3} />}
                    {gitlabRepos && gitlabRepos.length === 0 && (
                      <p className="nk-empty-hint">
                        No projects yet. Create one.
                      </p>
                    )}
                    {gitlabRepos && gitlabRepos.length > 0 && (
                      <ul className="nk-repo-list">
                        {gitlabRepos.map((r) => (
                          <li key={r.id}>
                            <button
                              className="nk-repo-row"
                              onClick={() => pickGitlab(r)}
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
                  </>
                )}

                {gitlabMode === "create" && (
                  <>
                    <label className="nk-field">
                      <span>Project name</span>
                      <input
                        type="text"
                        value={gitlabName}
                        onChange={(e) => setGitlabName(e.target.value)}
                        disabled={busy}
                        placeholder="notekit-vault"
                      />
                    </label>
                    <label className="nk-field nk-field--row">
                      <input
                        type="checkbox"
                        checked={gitlabPrivate}
                        onChange={(e) => setGitlabPrivate(e.target.checked)}
                        disabled={busy}
                      />
                      <span>Make project private (recommended)</span>
                    </label>
                    <button
                      className="nk-signin-btn"
                      onClick={createAndPickGitlab}
                      disabled={busy || !gitlabName.trim()}
                    >
                      {busy ? "Creating…" : "Create and use this project"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {provider === "notekit" && (
          <div className="nk-modal-body">
            {notekitStep === "provisioning" && (
              <p className="nk-empty-hint">Setting up your NoteKit Git account…</p>
            )}

            {notekitStep === "ready" && (
              <>
                <div className="nk-modal-tabs nk-modal-tabs--sub">
                  <button
                    className={notekitMode === "list" ? "active" : ""}
                    onClick={() => setNotekitMode("list")}
                  >
                    Existing repo
                  </button>
                  <button
                    className={notekitMode === "create" ? "active" : ""}
                    onClick={() => setNotekitMode("create")}
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
