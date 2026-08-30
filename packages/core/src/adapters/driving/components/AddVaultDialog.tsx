import React, { useEffect, useState } from "react";
import { vaultManagement } from "../../../composition/vault-management";
import type { VaultRef, VaultRepo } from "../../../domain/entities/vault";
import { GithubIcon, GitlabIcon, NotekitIcon } from "./BrandIcons";
import { Modal } from "./Modal";
import { SkeletonRepoList } from "./Skeleton";

type Provider = "github" | "gitlab" | "notekit";
type SubMode = "list" | "create";
type NotekitStep = "idle" | "provisioning" | "ready";
type GitlabStep = "idle" | "checking" | "needs-connect" | "ready";
type GithubStep = "checking" | "needs-install" | "ready";

interface AddVaultDialogProps {
  onAdded(vault: VaultRef): void;
  onCancel(): void;
  /** Provider tab to open on. Defaults to the recommended NoteKit-hosted Git. */
  initialProvider?: Provider;
}

function ProviderTabs({
  provider,
  onSelect,
}: {
  provider: Provider;
  onSelect(p: Provider): void;
}) {
  return (
    <div className="nk-provider-tabs">
      <button
        className={provider === "notekit" ? "active" : ""}
        onClick={() => onSelect("notekit")}
        title="NoteKit-hosted Git via Forgejo — no other account needed"
      >
        <NotekitIcon size={22} />
        <span>NoteKit Git</span>
        <span className="nk-tab-badge">Recommended</span>
      </button>
      <button
        className={provider === "github" ? "active" : ""}
        onClick={() => onSelect("github")}
        title="GitHub (bring your own)"
      >
        <GithubIcon size={22} />
        <span>GitHub</span>
      </button>
      <button
        className={provider === "gitlab" ? "active" : ""}
        onClick={() => onSelect("gitlab")}
        title="GitLab (bring your own)"
      >
        <GitlabIcon size={22} />
        <span>GitLab</span>
      </button>
    </div>
  );
}

function SubModeTabs({
  mode,
  listLabel,
  createLabel,
  onSelect,
}: {
  mode: SubMode;
  listLabel: string;
  createLabel: string;
  onSelect(m: SubMode): void;
}) {
  return (
    <div className="nk-modal-tabs nk-modal-tabs--sub">
      <button
        className={mode === "list" ? "active" : ""}
        onClick={() => onSelect("list")}
      >
        {listLabel}
      </button>
      <button
        className={mode === "create" ? "active" : ""}
        onClick={() => onSelect("create")}
      >
        {createLabel}
      </button>
    </div>
  );
}

function RepoList({
  repos,
  busy,
  emptyHint,
  onPick,
}: {
  repos: VaultRepo[] | null;
  busy: boolean;
  emptyHint: string;
  onPick(repo: VaultRepo): void;
}) {
  if (!repos) return <SkeletonRepoList count={3} />;
  if (repos.length === 0) return <p className="nk-empty-hint">{emptyHint}</p>;
  return (
    <ul className="nk-repo-list">
      {repos.map((r) => (
        <li key={r.id}>
          <button
            className="nk-repo-row"
            onClick={() => onPick(r)}
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
  );
}

function CreateRepoForm({
  name,
  isPrivate,
  busy,
  nameLabel,
  submitLabel,
  onChange,
  onPrivateChange,
  onSubmit,
}: {
  name: string;
  isPrivate: boolean;
  busy: boolean;
  nameLabel: string;
  submitLabel: string;
  onChange(value: string): void;
  onPrivateChange(value: boolean): void;
  onSubmit(): void;
}) {
  return (
    <>
      <label className="nk-field">
        <span>{nameLabel}</span>
        <input
          type="text"
          value={name}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
        />
      </label>
      <label className="nk-field nk-field--row">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => onPrivateChange(e.target.checked)}
          disabled={busy}
        />
        <span>Make private (recommended)</span>
      </label>
      <div className="nk-modal-actions">
        <button
          className="nk-btn nk-btn--primary"
          onClick={onSubmit}
          disabled={busy || !name.trim()}
        >
          {busy ? "Creating…" : submitLabel}
        </button>
      </div>
    </>
  );
}

function GithubReadyView({
  mode,
  account,
  repos,
  newName,
  newPrivate,
  busy,
  onModeSelect,
  onPick,
  onNameChange,
  onPrivateChange,
  onCreate,
}: {
  mode: SubMode;
  account: string | null;
  repos: VaultRepo[] | null;
  newName: string;
  newPrivate: boolean;
  busy: boolean;
  onModeSelect(m: SubMode): void;
  onPick(repo: VaultRepo): void;
  onNameChange(value: string): void;
  onPrivateChange(value: boolean): void;
  onCreate(): void;
}) {
  return (
    <>
      {account && (
        <p className="nk-empty-hint" style={{ fontSize: 12, marginBottom: 12 }}>
          Installed on <code>{account}</code>.
        </p>
      )}
      <SubModeTabs
        mode={mode}
        listLabel="Existing vault"
        createLabel="Create new vault"
        onSelect={onModeSelect}
      />
      {mode === "list" && (
        <RepoList repos={repos} busy={busy} emptyHint="No vaults yet. Create one." onPick={onPick} />
      )}
      {mode === "create" && (
        <CreateRepoForm
          name={newName}
          isPrivate={newPrivate}
          busy={busy}
          nameLabel="Vault name"
          submitLabel="Create vault"
          onChange={onNameChange}
          onPrivateChange={onPrivateChange}
          onSubmit={onCreate}
        />
      )}
    </>
  );
}

function GithubPanel({
  step,
  onInstall,
  ...readyProps
}: {
  step: GithubStep;
  onInstall(): void;
} & React.ComponentProps<typeof GithubReadyView>) {
  if (step === "checking") {
    return <p className="nk-empty-hint">Checking GitHub App…</p>;
  }
  if (step === "needs-install") {
    return (
      <>
        <p className="nk-empty-hint">
          NoteKit uses a GitHub App scoped to only the vault repos it
          creates — install it once to continue.
        </p>
        <div className="nk-modal-actions">
          <button className="nk-btn nk-btn--primary" onClick={onInstall}>
            Install NoteKit on GitHub
          </button>
        </div>
      </>
    );
  }
  return <GithubReadyView {...readyProps} />;
}

function GitlabConnectView({
  pat,
  busy,
  onPatChange,
  onConnect,
}: {
  pat: string;
  busy: boolean;
  onPatChange(value: string): void;
  onConnect(): void;
}) {
  return (
    <>
      <label className="nk-field">
        <span>Personal access token</span>
        <input
          type="password"
          value={pat}
          onChange={(e) => onPatChange(e.target.value)}
          disabled={busy}
          placeholder="glpat-…"
          autoComplete="off"
        />
        <span className="nk-field-hint">
          Scopes needed: <code>api</code> and <code>write_repository</code>.{" "}
          <a
            href="https://gitlab.com/-/user_settings/personal_access_tokens"
            target="_blank"
            rel="noreferrer"
          >
            Create one at gitlab.com
          </a>
          .
        </span>
      </label>
      <div className="nk-modal-actions">
        <button
          className="nk-btn nk-btn--primary"
          onClick={onConnect}
          disabled={busy || !pat.trim()}
        >
          {busy ? "Connecting…" : "Connect GitLab"}
        </button>
      </div>
    </>
  );
}

function GitlabReadyView({
  mode,
  login,
  repos,
  name,
  isPrivate,
  busy,
  onModeSelect,
  onPick,
  onNameChange,
  onPrivateChange,
  onCreate,
}: {
  mode: SubMode;
  login: string | null;
  repos: VaultRepo[] | null;
  name: string;
  isPrivate: boolean;
  busy: boolean;
  onModeSelect(m: SubMode): void;
  onPick(repo: VaultRepo): void;
  onNameChange(value: string): void;
  onPrivateChange(value: boolean): void;
  onCreate(): void;
}) {
  return (
    <>
      {login && (
        <p className="nk-empty-hint" style={{ fontSize: 12, marginBottom: 12 }}>
          Connected as <code>{login}</code> on gitlab.com.
        </p>
      )}
      <SubModeTabs
        mode={mode}
        listLabel="Existing project"
        createLabel="Create new project"
        onSelect={onModeSelect}
      />
      {mode === "list" && (
        <RepoList repos={repos} busy={busy} emptyHint="No projects yet. Create one." onPick={onPick} />
      )}
      {mode === "create" && (
        <CreateRepoForm
          name={name}
          isPrivate={isPrivate}
          busy={busy}
          nameLabel="Project name"
          submitLabel="Create and use this project"
          onChange={onNameChange}
          onPrivateChange={onPrivateChange}
          onSubmit={onCreate}
        />
      )}
    </>
  );
}

function GitlabPanel({
  step,
  pat,
  onPatChange,
  onConnect,
  ...readyProps
}: {
  step: GitlabStep;
  pat: string;
  onPatChange(value: string): void;
  onConnect(): void;
} & React.ComponentProps<typeof GitlabReadyView>) {
  if (step === "checking") {
    return <p className="nk-empty-hint">Checking GitLab connection…</p>;
  }
  if (step === "needs-connect") {
    return <GitlabConnectView pat={pat} busy={readyProps.busy} onPatChange={onPatChange} onConnect={onConnect} />;
  }
  return <GitlabReadyView {...readyProps} />;
}

function NotekitPanel({
  step,
  mode,
  username,
  repos,
  name,
  isPrivate,
  busy,
  onModeSelect,
  onPick,
  onNameChange,
  onPrivateChange,
  onCreate,
}: {
  step: NotekitStep;
  mode: SubMode;
  username: string | null;
  repos: VaultRepo[] | null;
  name: string;
  isPrivate: boolean;
  busy: boolean;
  onModeSelect(m: SubMode): void;
  onPick(repo: VaultRepo): void;
  onNameChange(value: string): void;
  onPrivateChange(value: boolean): void;
  onCreate(): void;
}) {
  if (step === "provisioning") {
    return <p className="nk-empty-hint">Setting up your NoteKit Git account…</p>;
  }

  if (step !== "ready") return null;

  return (
    <>
      <SubModeTabs
        mode={mode}
        listLabel="Existing repo"
        createLabel="Create new repo"
        onSelect={onModeSelect}
      />
      {mode === "list" && (
        <RepoList
          repos={repos}
          busy={busy}
          emptyHint="No repos yet. Create one."
          onPick={onPick}
        />
      )}
      {mode === "create" && (
        <>
          {username && (
            <p className="nk-empty-hint" style={{ marginBottom: 12 }}>
              Will be stored as <code>{username}/{name}</code>.
            </p>
          )}
          <CreateRepoForm
            name={name}
            isPrivate={isPrivate}
            busy={busy}
            nameLabel="Repo name"
            submitLabel="Create and use this repo"
            onChange={onNameChange}
            onPrivateChange={onPrivateChange}
            onSubmit={onCreate}
          />
        </>
      )}
    </>
  );
}

// eslint-disable-next-line max-lines-per-function -- orchestrates three provider flows (GitHub/GitLab/NoteKit) with shared state
export function AddVaultDialog({ onAdded, onCancel, initialProvider }: AddVaultDialogProps) {
  const [provider, setProvider] = useState<Provider>(initialProvider ?? "notekit");
  const [githubMode, setGithubMode] = useState<SubMode>("list");
  const [repos, setRepos] = useState<VaultRepo[] | null>(null);
  const [githubLoaded, setGithubLoaded] = useState(false);
  const [githubStep, setGithubStep] = useState<GithubStep>("checking");
  const [githubAccount, setGithubAccount] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("notekit-vault");
  const [newPrivate, setNewPrivate] = useState(true);

  const [notekitStep, setNotekitStep] = useState<NotekitStep>("idle");
  const [notekitUsername, setNotekitUsername] = useState<string | null>(null);
  const [notekitRepos, setNotekitRepos] = useState<VaultRepo[] | null>(null);
  const [notekitName, setNotekitName] = useState("vault");
  const [notekitPrivate, setNotekitPrivate] = useState(true);
  const [notekitMode, setNotekitMode] = useState<SubMode>("list");

  const [gitlabStep, setGitlabStep] = useState<GitlabStep>("idle");
  const [gitlabLogin, setGitlabLogin] = useState<string | null>(null);
  const [gitlabRepos, setGitlabRepos] = useState<VaultRepo[] | null>(null);
  const [gitlabPat, setGitlabPat] = useState("");
  const [gitlabName, setGitlabName] = useState("notekit-vault");
  const [gitlabPrivate, setGitlabPrivate] = useState(true);
  const [gitlabMode, setGitlabMode] = useState<SubMode>("list");

  useEffect(() => {
    if (provider !== "github" || githubLoaded) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot guard to prevent double-fetching when provider tab re-renders
    setGithubLoaded(true);
    setLoadErr(null);
    setGithubStep("checking");
    vaultManagement
      .githubAppStatus()
      .then((s) => {
        if (cancelled) return undefined;
        if (!s.configured) {
          setLoadErr("GitHub App isn't configured on the server.");
          return undefined;
        }
        if (!s.installed) {
          setGithubStep("needs-install");
          return undefined;
        }
        setGithubAccount(s.accountLogin ?? null);
        setGithubStep("ready");
        return vaultManagement.githubAppRepos();
      })
      .then((r) => {
        if (!cancelled && r) setRepos(r.repos);
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadErr(e.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally omitted; effect triggers only on the listed values
  }, [provider]);

  // Provision Forgejo account when switching to notekit tab.
  // Deps are [provider] ONLY — deliberately not notekitStep. Including the
  // step would re-run this effect the instant we setNotekitStep below, and
  // that re-run's cleanup flips `cancelled` true, swallowing the in-flight
  // provision response and stranding the UI on "Setting up…".
  useEffect(() => {
    if (provider !== "notekit" || notekitStep !== "idle") return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot guard; including notekitStep in deps would self-cancel the in-flight provision (see comment above)
    setNotekitStep("provisioning");
    setLoadErr(null);
    vaultManagement
      .provisionNotekit()
      .then((res) => {
        if (cancelled) return;
        setNotekitUsername(res.username);
        setNotekitStep("ready");
        return vaultManagement.listNotekitRepos();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally omitted; effect triggers only on the listed values
  }, [provider]);

  // Check GitLab connection state when entering the tab.
  // Deps are [provider] ONLY — same reasoning as the notekit effect above:
  // listing gitlabStep would self-cancel the in-flight status check the
  // moment we setGitlabStep("checking").
  useEffect(() => {
    if (provider !== "gitlab" || gitlabStep !== "idle") return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot guard; including gitlabStep in deps would self-cancel the in-flight status check (see comment above)
    setGitlabStep("checking");
    setLoadErr(null);
    vaultManagement
      .getGitlabStatus()
      .then((res) => {
        if (cancelled) return;
        if (!res.connected) {
          setGitlabStep("needs-connect");
          return;
        }
        setGitlabLogin(res.login);
        setGitlabStep("ready");
        return vaultManagement.listGitlabRepos();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally omitted; effect triggers only on the listed values
  }, [provider]);

  async function pick(repo: VaultRepo) {
    setBusy(true);
    setLoadErr(null);
    try {
      const res = await vaultManagement.addVault({
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

  async function createGithubVault() {
    setBusy(true);
    setLoadErr(null);
    try {
      const created = await vaultManagement.githubAppCreate(newName.trim(), newPrivate);
      const res = await vaultManagement.addVault({
        provider: "github",
        owner: created.owner,
        repo: created.name,
        branch: created.defaultBranch,
      });
      onAdded(res.vault);
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function connectGitlab() {
    if (!gitlabPat.trim()) return;
    setBusy(true);
    setLoadErr(null);
    try {
      const res = await vaultManagement.connectGitlab(gitlabPat.trim());
      setGitlabLogin(res.login);
      setGitlabPat("");
      setGitlabStep("ready");
      const list = await vaultManagement.listGitlabRepos();
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
      const res = await vaultManagement.addVault({
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
      const created = await vaultManagement.createGitlabRepo(gitlabName, gitlabPrivate);
      const res = await vaultManagement.addVault({
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
      const res = await vaultManagement.addVault({
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
      const created = await vaultManagement.createNotekitRepo(notekitName, notekitPrivate);
      const res = await vaultManagement.addVault({
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
    <Modal open onClose={onCancel} title="Add a vault">
      <p className="nk-dialog__description">
        Each vault is a workspace backed by exactly one Git repo.
      </p>

      <ProviderTabs provider={provider} onSelect={setProvider} />

      {loadErr && <div className="nk-modal-error">{loadErr}</div>}

      <div className="nk-dialog__body">
        {provider === "github" && (
          <GithubPanel
            step={githubStep}
            mode={githubMode}
            account={githubAccount}
            repos={repos}
            newName={newName}
            newPrivate={newPrivate}
            busy={busy}
            onModeSelect={setGithubMode}
            onInstall={() => {
              window.location.href = vaultManagement.githubAppInstallUrl();
            }}
            onPick={(r) => void pick(r)}
            onNameChange={setNewName}
            onPrivateChange={setNewPrivate}
            onCreate={() => void createGithubVault()}
          />
        )}

        {provider === "gitlab" && (
          <GitlabPanel
            step={gitlabStep}
            mode={gitlabMode}
            login={gitlabLogin}
            repos={gitlabRepos}
            pat={gitlabPat}
            name={gitlabName}
            isPrivate={gitlabPrivate}
            busy={busy}
            onModeSelect={setGitlabMode}
            onPatChange={setGitlabPat}
            onConnect={() => void connectGitlab()}
            onPick={(r) => void pickGitlab(r)}
            onNameChange={setGitlabName}
            onPrivateChange={setGitlabPrivate}
            onCreate={() => void createAndPickGitlab()}
          />
        )}

        {provider === "notekit" && (
          <NotekitPanel
            step={notekitStep}
            mode={notekitMode}
            username={notekitUsername}
            repos={notekitRepos}
            name={notekitName}
            isPrivate={notekitPrivate}
            busy={busy}
            onModeSelect={setNotekitMode}
            onPick={(r) => void pickNotekit(r)}
            onNameChange={setNotekitName}
            onPrivateChange={setNotekitPrivate}
            onCreate={() => void createAndPickNotekit()}
          />
        )}
      </div>
    </Modal>
  );
}
