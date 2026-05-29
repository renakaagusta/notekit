import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import * as vaultApi from "../lib/vault-api";
import { SkeletonLines, SkeletonCommitList } from "./Skeleton";
import type {
  VaultRef,
  VaultSettings,
  VaultMember,
  VaultInvitation,
  CollaboratorPermission,
} from "../lib/vault-api";

interface VaultSettingsDialogProps {
  vault: VaultRef;
  onClose(): void;
  /** Called after a successful settings save. Receives the updated settings. */
  onSaved?(settings: VaultSettings): void;
  /** Rename the vault. Resolves once the new label is persisted. */
  onRename(id: string, label: string | null): Promise<void>;
  /** Unregister the vault. Resolves once removed. */
  onDelete(id: string): Promise<void>;
}

const THEMES: { value: VaultSettings["theme"]; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Follows the OS preference." },
  { value: "light", label: "Light", hint: "Forces light mode for this vault." },
  { value: "dark", label: "Dark", hint: "Forces dark mode for this vault." },
];

/** Collapsible subsection — native <details> so it stays keyboard-accessible. */
function Section({
  title,
  children,
  defaultOpen = false,
  danger = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  danger?: boolean;
}) {
  return (
    <details
      className={`nk-collapse${danger ? " nk-collapse--danger" : ""}`}
      open={defaultOpen}
    >
      <summary className="nk-collapse-hd">
        <ChevronRight size={14} className="nk-collapse-caret" aria-hidden />
        <span>{title}</span>
      </summary>
      <div className="nk-collapse-body">{children}</div>
    </details>
  );
}

export function VaultSettingsDialog({
  vault,
  onClose,
  onSaved,
  onRename,
  onDelete,
}: VaultSettingsDialogProps) {
  const [settings, setSettings] = useState<VaultSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!vault.id) return;
    let cancelled = false;
    setError(null);
    vaultApi
      .getVaultSettings(vault.id)
      .then((r) => {
        if (!cancelled) setSettings(r.settings);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [vault.id]);

  async function save() {
    if (!vault.id || !settings) return;
    setBusy(true);
    setError(null);
    try {
      const res = await vaultApi.patchVaultSettings(vault.id, settings);
      setSettings(res.settings);
      onSaved?.(res.settings);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nk-modal-backdrop" onClick={onClose}>
      <div className="nk-modal" onClick={(e) => e.stopPropagation()}>
        <header className="nk-modal-hd">
          <h2>Vault settings</h2>
          <p className="nk-modal-sub">
            {vault.label || `${vault.owner}/${vault.repo}`}
          </p>
        </header>
        <button
          className="nk-modal-close nk-iconbtn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <X size={16} aria-hidden />
        </button>

        {error && <div className="nk-modal-error">{error}</div>}
        {!settings && !error && (
          <div className="nk-modal-body">
            <SkeletonLines count={4} />
          </div>
        )}

        {settings && (
          <div className="nk-modal-body">
            <Section title="General" defaultOpen>
              <fieldset className="nk-field-group">
                <legend>Theme</legend>
                <div className="nk-radio-group">
                  {THEMES.map((t) => (
                    <label key={t.value} className="nk-radio">
                      <input
                        type="radio"
                        name="theme"
                        value={t.value}
                        checked={settings.theme === t.value}
                        onChange={() =>
                          setSettings({ ...settings, theme: t.value })
                        }
                        disabled={busy}
                      />
                      <span>
                        <b>{t.label}</b>
                        <span className="nk-radio-hint">{t.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="nk-field">
                <span>Default folder for new notes</span>
                <input
                  type="text"
                  value={settings.defaultFolder ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultFolder: e.target.value.trim() || null,
                    })
                  }
                  placeholder="(root)"
                  disabled={busy}
                />
                <span className="nk-field-hint">
                  New notes drop into this folder. Leave blank to use the vault
                  root.
                </span>
              </label>

              <label className="nk-field">
                <span>Default agent slug</span>
                <input
                  type="text"
                  value={settings.defaultAgentSlug ?? ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultAgentSlug: e.target.value.trim() || null,
                    })
                  }
                  placeholder="(none — commit as you)"
                  disabled={busy}
                />
                <span className="nk-field-hint">
                  Agent-authored commits for this vault. Saved now; applied to
                  the AI commit flow when the panel is wired.
                </span>
              </label>

              <div className="nk-modal-actions">
                <button
                  className="nk-vault-rename-cancel"
                  onClick={onClose}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  className="nk-signin-btn"
                  onClick={save}
                  disabled={busy}
                  style={{ maxWidth: 160 }}
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </Section>

            <Section title="Members">
              <MembersSection vault={vault} />
            </Section>

            <Section title="Rename">
              <RenameSection
                vault={vault}
                onRename={onRename}
              />
            </Section>

            <Section title="Danger zone" danger>
              <DangerSection
                vault={vault}
                onDelete={async (id) => {
                  await onDelete(id);
                  onClose();
                }}
              />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rename                                                                       */
/* -------------------------------------------------------------------------- */

function RenameSection({
  vault,
  onRename,
}: {
  vault: VaultRef;
  onRename(id: string, label: string | null): Promise<void>;
}) {
  const [label, setLabel] = useState(vault.label ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!vault.id) return;
    setBusy(true);
    setError(null);
    try {
      await onRename(vault.id, label.trim() || null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="nk-field" onSubmit={submit}>
      <span>Display name</span>
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={`${vault.owner}/${vault.repo}`}
        disabled={busy}
      />
      <span className="nk-field-hint">
        Shown in the vault switcher. Leave blank to fall back to{" "}
        <code>{vault.owner}/{vault.repo}</code>.
      </span>
      {error && <div className="nk-modal-error">{error}</div>}
      <div className="nk-modal-actions">
        <button className="nk-signin-btn" type="submit" disabled={busy} style={{ maxWidth: 160 }}>
          {busy ? "Saving…" : "Save name"}
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Danger zone                                                                  */
/* -------------------------------------------------------------------------- */

function DangerSection({
  vault,
  onDelete,
}: {
  vault: VaultRef;
  onDelete(id: string): Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repoKind =
    vault.provider === "gitlab"
      ? "GitLab project"
      : vault.provider === "notekit"
        ? "NoteKit Git repo"
        : "GitHub repo";

  async function remove() {
    if (!vault.id) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(vault.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="nk-field">
      <p className="nk-field-hint" style={{ marginTop: 0 }}>
        Unregister this vault from NoteKit. The underlying {repoKind} is left
        untouched — you can re-add it any time.
      </p>
      {error && <div className="nk-modal-error">{error}</div>}
      {!confirming ? (
        <div className="nk-modal-actions">
          <button
            className="nk-vault-confirm-yes"
            onClick={() => setConfirming(true)}
            disabled={busy}
          >
            Unregister vault
          </button>
        </div>
      ) : (
        <div className="nk-vault-confirm">
          <p>
            Unregister <b>{vault.label || `${vault.owner}/${vault.repo}`}</b>?
          </p>
          <div className="nk-vault-confirm-actions">
            <button
              className="nk-vault-confirm-yes"
              onClick={remove}
              disabled={busy}
            >
              {busy ? "Unregistering…" : "Yes, unregister"}
            </button>
            <button
              className="nk-vault-confirm-no"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Members                                                                      */
/* -------------------------------------------------------------------------- */

const PERMISSIONS: {
  value: CollaboratorPermission;
  label: string;
  hint: string;
}[] = [
  { value: "pull", label: "Read", hint: "Can read files only." },
  { value: "push", label: "Write", hint: "Can read and commit files." },
  { value: "admin", label: "Admin", hint: "Full access including settings." },
];

function MembersSection({ vault }: { vault: VaultRef }) {
  const [members, setMembers] = useState<VaultMember[] | null>(null);
  const [invitations, setInvitations] = useState<VaultInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [permission, setPermission] = useState<CollaboratorPermission>("push");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    if (!vault.id) return;
    setError(null);
    try {
      const res = await vaultApi.listVaultMembers(vault.id);
      setMembers(res.members);
      setInvitations(res.invitations);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, [vault.id]);

  async function onInvite() {
    const name = username.trim();
    if (!name || !vault.id) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await vaultApi.addVaultMember(vault.id, name, permission);
      setUsername("");
      if (res.status === "invited") {
        setNotice(
          `Invitation sent to @${name}. They'll get an email from GitHub.`,
        );
      } else {
        setNotice(`@${name} already has access — permission updated.`);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(login: string) {
    if (!vault.id) return;
    if (
      !confirm(
        `Remove @${login} from this vault? They'll lose access immediately.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await vaultApi.removeVaultMember(vault.id, login);
      setNotice(`@${login} removed.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onCancelInvite(invitationId: number, login: string) {
    if (!vault.id) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await vaultApi.cancelVaultInvitation(vault.id, invitationId);
      setNotice(`Invitation to @${login} cancelled.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <div className="nk-modal-error">{error}</div>}
      {notice && (
        <div
          className="nk-modal-error"
          style={{
            background: "rgba(34, 197, 94, 0.08)",
            borderColor: "rgba(34, 197, 94, 0.35)",
            color: "var(--text)",
          }}
        >
          {notice}
        </div>
      )}

      <fieldset className="nk-field-group">
        <legend>Invite by GitHub username</legend>
        <div style={{ display: "flex", gap: "var(--gap-2)", flexWrap: "wrap" }}>
          <input
            className="nk-input"
            placeholder="github-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onInvite();
            }}
            disabled={busy}
            style={{ flex: 1, minWidth: 160 }}
          />
          <select
            className="nk-input"
            value={permission}
            onChange={(e) =>
              setPermission(e.target.value as CollaboratorPermission)
            }
            disabled={busy}
            style={{ width: "auto" }}
          >
            {PERMISSIONS.map((p) => (
              <option key={p.value} value={p.value} title={p.hint}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            className="nk-btn nk-btn--primary"
            onClick={onInvite}
            disabled={busy || !username.trim()}
          >
            {busy ? "Sending…" : "Invite"}
          </button>
        </div>
        <p className="nk-field-hint">
          GitHub sends them a collaboration email. They can then add this repo as
          their NoteKit vault.
        </p>
      </fieldset>

      {members === null && !error && <SkeletonCommitList count={3} />}

      {invitations.length > 0 && (
        <fieldset className="nk-field-group">
          <legend>Pending invitations</legend>
          <ol className="nk-commitlist" style={{ margin: 0 }}>
            {invitations.map((inv) => (
              <li key={inv.id} className="nk-commit">
                <div className="nk-commit-row">
                  {inv.inviteeAvatar ? (
                    <img className="nk-commit-avatar" src={inv.inviteeAvatar} alt="" />
                  ) : (
                    <div className="nk-commit-avatar nk-commit-avatar--ph">
                      {inv.inviteeLogin.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="nk-commit-body">
                    <div className="nk-commit-msg">@{inv.inviteeLogin}</div>
                    <div className="nk-commit-meta">
                      {inv.permission} · invited {formatTime(inv.createdAt)}
                    </div>
                  </div>
                  <span
                    className="nk-chip nk-chip--soft"
                    style={{ alignSelf: "center" }}
                  >
                    pending
                  </span>
                  <button
                    className="nk-iconbtn"
                    onClick={() => onCancelInvite(inv.id, inv.inviteeLogin)}
                    title="Cancel invitation"
                    aria-label={`Cancel invitation for ${inv.inviteeLogin}`}
                    disabled={busy}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </fieldset>
      )}

      {members && members.length > 0 && (
        <fieldset className="nk-field-group">
          <legend>Collaborators</legend>
          <ol className="nk-commitlist" style={{ margin: 0 }}>
            {members.map((m) => (
              <li key={m.login} className="nk-commit">
                <div className="nk-commit-row">
                  {m.avatarUrl ? (
                    <img className="nk-commit-avatar" src={m.avatarUrl} alt="" />
                  ) : (
                    <div className="nk-commit-avatar nk-commit-avatar--ph">
                      {m.login.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="nk-commit-body">
                    <div className="nk-commit-msg">
                      <a href={m.htmlUrl} target="_blank" rel="noopener noreferrer">
                        @{m.login}
                      </a>
                    </div>
                    <div className="nk-commit-meta">{m.permission}</div>
                  </div>
                  <button
                    className="nk-iconbtn"
                    onClick={() => onRemove(m.login)}
                    title="Remove collaborator"
                    aria-label={`Remove ${m.login}`}
                    disabled={busy}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </fieldset>
      )}

      {members && members.length === 0 && invitations.length === 0 && (
        <p className="nk-empty-hint">
          No collaborators yet. Invite someone by GitHub username above.
        </p>
      )}
    </>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
