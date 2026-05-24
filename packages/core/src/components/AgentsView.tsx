import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { SkeletonCommitList } from "./Skeleton";
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  type AgentProfile,
} from "../lib/agents-api";
import { gravatarUrlFor } from "../lib/gravatar";

export interface AgentFocusPulse {
  slug: string;
  seq: number;
}

interface AgentsViewProps {
  /** Scroll this agent into view and flash-highlight it (e.g. from search). */
  focusAgent?: AgentFocusPulse | null;
}

interface DraftFields {
  name: string;
  email: string;
  description: string;
}

export function AgentsView({ focusAgent }: AgentsViewProps = {}) {
  const [agents, setAgents] = useState<AgentProfile[] | null>(null);
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    if (!focusAgent || !agents) return;
    const el = rowRefs.current.get(focusAgent.slug);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("is-focus-flash");
    const t = setTimeout(() => el.classList.remove("is-focus-flash"), 1400);
    return () => clearTimeout(t);
  }, [focusAgent, agents]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<DraftFields>({
    name: "",
    email: "",
    description: "",
  });
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftFields>({
    name: "",
    email: "",
    description: "",
  });
  const [reveal, setReveal] = useState<{
    slug: string;
    token: string;
    /** Surfaced in the reveal panel so the user can register a Gravatar
     *  for this email and unlock the avatar on GitHub commit pages. */
    email: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setError(null);
      const res = await listAgents();
      setAgents(res.agents);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function resetNewDraft() {
    setNewDraft({ name: "", email: "", description: "" });
  }

  async function onCreate() {
    const name = newDraft.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      setError(null);
      const res = await createAgent({
        name,
        email: newDraft.email.trim() || undefined,
        description: newDraft.description.trim() || undefined,
      });
      setReveal({
        slug: res.agent.slug,
        token: res.token,
        email: res.agent.email,
      });
      resetNewDraft();
      setCreating(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(a: AgentProfile) {
    setEditingSlug(a.slug);
    setEditDraft({
      name: a.name,
      email: a.email,
      description: a.description ?? "",
    });
  }

  async function onSaveEdit() {
    if (!editingSlug) return;
    setBusy(true);
    try {
      setError(null);
      await updateAgent(editingSlug, {
        name: editDraft.name.trim() || undefined,
        email: editDraft.email.trim() || undefined,
        description: editDraft.description,
      });
      setEditingSlug(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(slug: string) {
    if (
      !confirm(
        `Revoke agent "${slug}"? Its token will stop working immediately and its profile file will be removed from the vault.`,
      )
    )
      return;
    try {
      setError(null);
      await deleteAgent(slug);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onCopy(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available; the field is selectable.
    }
  }

  return (
    <section className="nk-history">
      {error && <div className="nk-history-error">Failed: {error}</div>}

      {/* Once at the top of the section: explain where avatars come from. */}
      <div
        style={{
          padding: "var(--gap-2) var(--gap-3)",
          fontSize: "0.85em",
          color: "var(--text-dim)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        💡 Profile pictures come from{" "}
        <a
          href="https://gravatar.com"
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          Gravatar
        </a>
        . Register an agent's email at gravatar.com to give it a real photo
        everywhere — NoteKit, GitHub commit pages, and Forgejo. Otherwise
        Gravatar's deterministic identicon is shown.
      </div>

      {reveal && (
        <div
          className="nk-history-error"
          style={{
            background: "rgba(245, 197, 24, 0.08)",
            borderColor: "rgba(245, 197, 24, 0.35)",
            color: "var(--text)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--gap-3)",
          }}
        >
          <div>
            <strong>Token for {reveal.slug}</strong> — shown once. Copy it now;
            you won't see it again. If you lose it, delete the agent and create
            a new one.
          </div>
          <div style={{ display: "flex", gap: "var(--gap-2)" }}>
            <input
              className="nk-input"
              readOnly
              value={reveal.token}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: 1, fontFamily: "var(--mono-font)" }}
            />
            <button
              className="nk-iconbtn"
              onClick={() => onCopy(reveal.token)}
              title="Copy token"
            >
              {copied ? <Check size={14} aria-hidden /> : "Copy"}
            </button>
            <button
              className="nk-iconbtn"
              onClick={() => setReveal(null)}
              title="Dismiss"
            >
              Done
            </button>
          </div>

          {/*
            Gravatar is the single source of truth for agent avatars across
            NoteKit, GitHub commit pages, and Forgejo. There's no per-agent
            URL stored; just the email above.
          */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--gap-2)",
              paddingTop: "var(--gap-2)",
              borderTop: "1px solid rgba(245, 197, 24, 0.25)",
            }}
          >
            <img className="nk-commit-avatar" src={gravatarUrlFor(reveal.email)} alt="" />
            <div style={{ flex: 1, fontSize: "0.9em" }}>
              To give this agent a profile picture, register{" "}
              <code style={{ fontFamily: "var(--mono-font)" }}>{reveal.email}</code>{" "}
              on Gravatar. The avatar then appears here, on GitHub commits, and on
              Forgejo.
            </div>
            <a
              className="nk-btn"
              href={`https://gravatar.com/connect/?email=${encodeURIComponent(reveal.email)}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              Set up Gravatar
            </a>
          </div>
        </div>
      )}

      {!creating && (
        <div style={{ padding: "var(--gap-3)" }}>
          <button className="nk-btn" onClick={() => setCreating(true)}>
            + New agent
          </button>
        </div>
      )}

      {creating && (
        <AgentForm
          draft={newDraft}
          onChange={setNewDraft}
          onSubmit={onCreate}
          onCancel={() => {
            setCreating(false);
            resetNewDraft();
          }}
          submitLabel={busy ? "Creating…" : "Create"}
          disabled={busy}
          autoFocus
        />
      )}

      {!error && agents === null && <SkeletonCommitList count={3} />}

      {agents && agents.length === 0 && (
        <div className="nk-empty">
          <p>No agents yet.</p>
          <p className="nk-empty-hint">
            Create an agent to give an AI assistant its own identity. Commits
            it makes are attributed to the agent in git history, with you as
            the committer.
          </p>
        </div>
      )}

      {agents && agents.length > 0 && (
        <ol className="nk-commitlist">
          {agents.map((a) =>
            editingSlug === a.slug ? (
              <li key={a.slug} className="nk-commit">
                <AgentForm
                  draft={editDraft}
                  onChange={setEditDraft}
                  onSubmit={onSaveEdit}
                  onCancel={() => setEditingSlug(null)}
                  submitLabel={busy ? "Saving…" : "Save"}
                  disabled={busy}
                  emailHint={`Slug stays "${a.slug}" — vault path doesn't change.`}
                  autoFocus
                />
              </li>
            ) : (
              <li
                key={a.slug}
                className="nk-commit"
                ref={(el) => {
                  if (el) rowRefs.current.set(a.slug, el);
                  else rowRefs.current.delete(a.slug);
                }}
              >
                <div className="nk-commit-row">
                  {/* Gravatar serves the agent owner's photo for registered
                      emails, or its identicon otherwise. No URL stored on the
                      agent — it's computed from the email at render time. */}
                  <img
                    className="nk-commit-avatar"
                    src={gravatarUrlFor(a.email)}
                    alt=""
                  />

                  <div className="nk-commit-body">
                    <div className="nk-commit-msg">{a.name}</div>
                    {a.description && (
                      <div className="nk-agent-desc">{a.description}</div>
                    )}
                    <div className="nk-commit-meta">
                      <code style={{ fontFamily: "var(--mono-font)" }}>
                        {a.email}
                      </code>
                      {" · "}
                      created {formatTime(a.createdAt)}
                      {" · "}
                      <code style={{ fontFamily: "var(--mono-font)" }}>
                        agents/{a.slug}.json
                      </code>
                    </div>
                  </div>
                  <button
                    className="nk-iconbtn"
                    onClick={() => startEdit(a)}
                    title="Edit agent"
                    aria-label={`Edit ${a.slug}`}
                  >
                    <Pencil size={13} aria-hidden />
                  </button>
                  <button
                    className="nk-iconbtn"
                    onClick={() => onDelete(a.slug)}
                    title="Revoke agent"
                    aria-label={`Revoke ${a.slug}`}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  );
}

interface AgentFormProps {
  draft: DraftFields;
  onChange(d: DraftFields): void;
  onSubmit(): void;
  onCancel(): void;
  submitLabel: string;
  disabled?: boolean;
  emailHint?: string;
  autoFocus?: boolean;
}

function AgentForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  disabled,
  emailHint,
  autoFocus,
}: AgentFormProps) {
  return (
    <div
      style={{
        padding: "var(--gap-3)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--gap-2)",
      }}
    >
      <input
        className="nk-input"
        placeholder="Agent name (e.g. Triage Bot)"
        autoFocus={autoFocus}
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") void onSubmit();
          if (e.key === "Escape") onCancel();
        }}
        disabled={disabled}
      />
      <input
        className="nk-input"
        placeholder={
          emailHint ??
          "Email (optional — server picks a default if you leave it blank; pick a Gravatar-registered email to get a real avatar)"
        }
        value={draft.email}
        onChange={(e) => onChange({ ...draft, email: e.target.value })}
        disabled={disabled}
      />
      <textarea
        className="nk-input"
        placeholder="Description — what this agent does, who runs it, scope of authority…"
        value={draft.description}
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
        disabled={disabled}
        rows={3}
        style={{ resize: "vertical", fontFamily: "inherit" }}
      />
      {/* Live preview of the avatar the agent will render with, sourced
          from Gravatar by email hash. Until the email is filled in (or
          defaulted by the server on submit), show the placeholder. */}
      {draft.email.trim() && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--gap-2)",
            fontSize: "0.85em",
            color: "var(--text-dim)",
          }}
        >
          <img
            className="nk-commit-avatar"
            alt=""
            src={gravatarUrlFor(draft.email.trim())}
            style={{ background: "var(--surface-2)" }}
          />
          <span>
            Avatar comes from Gravatar for{" "}
            <code style={{ fontFamily: "var(--mono-font)" }}>
              {draft.email.trim()}
            </code>
            . Register that email at{" "}
            <a
              href="https://gravatar.com"
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              gravatar.com
            </a>{" "}
            to replace the identicon with a real photo.
          </span>
        </div>
      )}
      <div style={{ display: "flex", gap: "var(--gap-2)" }}>
        <button
          className="nk-btn nk-btn--primary"
          onClick={onSubmit}
          disabled={disabled}
        >
          {submitLabel}
        </button>
        <button className="nk-btn" onClick={onCancel} disabled={disabled}>
          Cancel
        </button>
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
