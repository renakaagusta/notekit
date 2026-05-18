import { useEffect, useState } from "react";
import { X } from "lucide-react";
import * as vaultApi from "../lib/vault-api";
import { SkeletonCommitList } from "./Skeleton";
import type {
  VaultRef,
  VaultMember,
  VaultInvitation,
  CollaboratorPermission,
} from "../lib/vault-api";

interface VaultMembersDialogProps {
  vault: VaultRef;
  onClose(): void;
}

const PERMISSIONS: { value: CollaboratorPermission; label: string; hint: string }[] = [
  { value: "pull", label: "Read", hint: "Can read files only." },
  { value: "push", label: "Write", hint: "Can read and commit files." },
  { value: "admin", label: "Admin", hint: "Full access including settings." },
];

export function VaultMembersDialog({ vault, onClose }: VaultMembersDialogProps) {
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
        setNotice(`Invitation sent to @${name}. They'll get an email from GitHub.`);
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
    if (!confirm(`Remove @${login} from this vault? They'll lose access immediately.`)) return;
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
    <div className="nk-modal-backdrop" onClick={onClose}>
      <div className="nk-modal" onClick={(e) => e.stopPropagation()}>
        <header className="nk-modal-hd">
          <h2>Members</h2>
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

        <div className="nk-modal-body">
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
                onChange={(e) => setPermission(e.target.value as CollaboratorPermission)}
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
              GitHub sends them a collaboration email. They can then add this repo as their NoteKit vault.
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
        </div>
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
