import { useEffect, useState } from "react";
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  type AgentProfile,
} from "../lib/agents-api";

interface DraftFields {
  name: string;
  email: string;
  description: string;
}

export function AgentsView() {
  const [agents, setAgents] = useState<AgentProfile[] | null>(null);
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
  const [reveal, setReveal] = useState<{ slug: string; token: string } | null>(
    null,
  );
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
      setReveal({ slug: res.agent.slug, token: res.token });
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

      {reveal && (
        <div
          className="nk-history-error"
          style={{
            background: "rgba(245, 197, 24, 0.08)",
            borderColor: "rgba(245, 197, 24, 0.35)",
            color: "var(--text)",
          }}
        >
          <div style={{ marginBottom: "var(--gap-2)" }}>
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
              {copied ? "✓" : "Copy"}
            </button>
            <button
              className="nk-iconbtn"
              onClick={() => setReveal(null)}
              title="Dismiss"
            >
              Done
            </button>
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

      {!error && agents === null && <div className="nk-empty">Loading…</div>}

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
              <li key={a.slug} className="nk-commit">
                <div className="nk-commit-row">
                  {a.avatarUrl ? (
                    <img className="nk-commit-avatar" src={a.avatarUrl} alt="" />
                  ) : (
                    <div className="nk-commit-avatar nk-commit-avatar--ph">
                      {a.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
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
                    ✎
                  </button>
                  <button
                    className="nk-iconbtn"
                    onClick={() => onDelete(a.slug)}
                    title="Revoke agent"
                    aria-label={`Revoke ${a.slug}`}
                  >
                    ×
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
          emailHint ?? "Email (optional — defaults to <slug>@agents.notekit.app)"
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
