import { useEffect, useRef, useState } from "react";
import { Check, Lightbulb, Lock, Pencil, X } from "lucide-react";
import { SkeletonCommitList } from "./Skeleton";
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  DEFAULT_AGENT_MODEL,
  type AgentProfile,
  type AgentToolPermissions,
  type AgentProvider,
} from "../lib/agents-api";
import { gravatarUrlFor } from "../lib/gravatar";
import { useCryptoStore } from "../stores/cryptoStore";
import { listSecretNames, setSecret, removeSecret } from "../lib/secrets-vault";

export interface AgentFocusPulse {
  slug: string;
  seq: number;
}

interface AgentsViewProps {
  /** Scroll this agent into view and flash-highlight it (e.g. from search). */
  focusAgent?: AgentFocusPulse | null;
}

/** Anthropic models offered in the profile picker. Keep labels human-friendly. */
export const AGENT_MODELS: { value: string; label: string; hint: string }[] = [
  { value: "claude-3-5-haiku-latest", label: "Haiku 3.5", hint: "Cepat & murah" },
  { value: "claude-sonnet-4-5", label: "Sonnet 4.5", hint: "Seimbang" },
  { value: "claude-opus-4-1", label: "Opus 4.1", hint: "Paling pintar" },
];

/** Provider key slots shown in the Agents modal. Names map to vault secrets. */
const KEY_PROVIDERS: { name: string; label: string; placeholder: string; hint: string }[] = [
  {
    name: "anthropic",
    label: "Anthropic API key",
    placeholder: "sk-ant-…",
    hint: "Untuk profil provider Anthropic.",
  },
  {
    name: "openai-compatible",
    label: "OpenAI-compatible key",
    placeholder: "sk-…",
    hint: "Untuk profil provider OpenAI-compatible (mis. 9router / MiniMax).",
  },
];

interface DraftFields {
  name: string;
  email: string;
  description: string;
  emoji: string;
  model: string;
  systemPrompt: string;
  toolPermissions: AgentToolPermissions;
  provider: AgentProvider;
  baseUrl: string;
}

const EMPTY_DRAFT: DraftFields = {
  name: "",
  email: "",
  description: "",
  emoji: "",
  model: DEFAULT_AGENT_MODEL,
  systemPrompt: "",
  toolPermissions: "read-only",
  provider: "anthropic",
  baseUrl: "",
};

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
  const [newDraft, setNewDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [reveal, setReveal] = useState<{
    slug: string;
    token: string;
    /** Surfaced in the reveal panel so the user can register a Gravatar
     *  for this email and unlock the avatar on GitHub commit pages. */
    email: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // ── Provider API keys (shared by all profiles; stored in the E2EE vault) ──
  const device = useCryptoStore((s) => s.device);
  const cryptoPhase = useCryptoStore((s) => s.phase);
  const [keyStored, setKeyStored] = useState<Record<string, boolean>>({});
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [keyBusy, setKeyBusy] = useState(false);

  async function refreshKey() {
    if (!device || cryptoPhase !== "ready") return;
    try {
      const names = await listSecretNames();
      setKeyStored({
        anthropic: names.includes("anthropic"),
        "openai-compatible": names.includes("openai-compatible"),
      });
    } catch {
      /* vault not readable yet — leave as unknown */
    }
  }

  useEffect(() => {
    void refreshKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, cryptoPhase]);

  async function onSaveKey(name: string) {
    const value = keyDraft[name]?.trim();
    if (!value || !device) return;
    setKeyBusy(true);
    setError(null);
    try {
      await setSecret(name, value, device);
      setKeyDraft((d) => ({ ...d, [name]: "" }));
      await refreshKey();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setKeyBusy(false);
    }
  }

  async function onRemoveKey(name: string) {
    if (!device) return;
    if (!window.confirm(`Hapus "${name}" key dari vault?`)) return;
    setKeyBusy(true);
    try {
      await removeSecret(name, device);
      await refreshKey();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setKeyBusy(false);
    }
  }

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
    setNewDraft(EMPTY_DRAFT);
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
        emoji: newDraft.emoji.trim() || undefined,
        model: newDraft.model,
        systemPrompt: newDraft.systemPrompt.trim() || undefined,
        toolPermissions: newDraft.toolPermissions,
        provider: newDraft.provider,
        baseUrl: newDraft.baseUrl.trim() || undefined,
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
      emoji: a.emoji ?? "",
      model: a.model ?? DEFAULT_AGENT_MODEL,
      systemPrompt: a.systemPrompt ?? "",
      toolPermissions: a.toolPermissions ?? "read-only",
      provider: a.provider ?? "anthropic",
      baseUrl: a.baseUrl ?? "",
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
        emoji: editDraft.emoji.trim(),
        model: editDraft.model,
        systemPrompt: editDraft.systemPrompt.trim(),
        toolPermissions: editDraft.toolPermissions,
        provider: editDraft.provider,
        baseUrl: editDraft.baseUrl.trim(),
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
          display: "flex",
          gap: "var(--gap-2)",
          alignItems: "flex-start",
          padding: "var(--gap-2) var(--gap-3)",
          fontSize: "0.85em",
          color: "var(--text-dim)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Lightbulb size={14} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
        Profile pictures come from{" "}
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
        </span>
      </div>

      {/* Provider keys — shared by all profiles, decrypted on-device and posted
          straight to the provider (never through NoteKit servers). */}
      <div className="nk-agent-keybox">
        {cryptoPhase !== "ready" ? (
          <p className="nk-agent-keybox-hint">
            Buka & buka-kunci vault terenkripsi dulu untuk menyimpan key.
          </p>
        ) : (
          <>
            {KEY_PROVIDERS.map((p) => (
              <div key={p.name}>
                <div className="nk-agent-keybox-hd">
                  <strong>{p.label}</strong>
                  {keyStored[p.name] && <span className="nk-pill">tersimpan</span>}
                </div>
                <div className="nk-agent-keybox-row">
                  <input
                    className="nk-input"
                    type="password"
                    autoComplete="off"
                    placeholder={keyStored[p.name] ? `Ganti key… (${p.placeholder})` : p.placeholder}
                    value={keyDraft[p.name] ?? ""}
                    onChange={(e) => setKeyDraft((d) => ({ ...d, [p.name]: e.target.value }))}
                    disabled={keyBusy}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="nk-btn nk-btn--primary"
                    onClick={() => onSaveKey(p.name)}
                    disabled={keyBusy || !keyDraft[p.name]?.trim()}
                  >
                    {keyStored[p.name] ? "Ganti" : "Simpan"}
                  </button>
                  {keyStored[p.name] && (
                    <button className="nk-btn" onClick={() => onRemoveKey(p.name)} disabled={keyBusy}>
                      Hapus
                    </button>
                  )}
                </div>
                <p className="nk-agent-keybox-hint">{p.hint}</p>
              </div>
            ))}
            <p className="nk-agent-keybox-hint">
              <Lock size={12} aria-hidden /> Semua key disimpan terenkripsi di vault
              dan dipanggil langsung ke provider — tanpa relay server NoteKit.
            </p>
          </>
        )}
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
        rows={2}
        style={{ resize: "vertical", fontFamily: "inherit" }}
      />

      {/* ── AI chat persona ─────────────────────────────────────────
       * These fields drive the in-app AI assistant when this agent is
       * the selected profile: which model runs, how it behaves, and
       * whether it may modify the vault. */}
      <div className="nk-agent-section-label">AI assistant</div>
      <div style={{ display: "flex", gap: "var(--gap-2)" }}>
        <input
          className="nk-input"
          placeholder="ikon"
          aria-label="Emoji"
          value={draft.emoji}
          onChange={(e) => onChange({ ...draft, emoji: e.target.value })}
          disabled={disabled}
          maxLength={4}
          style={{ width: 56, textAlign: "center", flexShrink: 0 }}
        />
        <select
          className="nk-input"
          aria-label="Provider"
          value={draft.provider}
          onChange={(e) => {
            const provider = e.target.value as AgentProvider;
            // Reset the model to a sensible default when switching family.
            const model =
              provider === "anthropic" ? DEFAULT_AGENT_MODEL : "";
            onChange({ ...draft, provider, model });
          }}
          disabled={disabled}
          style={{ flex: 1 }}
        >
          <option value="anthropic">Anthropic</option>
          <option value="openai-compatible">OpenAI-compatible</option>
        </select>
      </div>
      {draft.provider === "openai-compatible" && (
        <input
          className="nk-input"
          placeholder="Base URL — mis. https://9router.stackbase.id/v1"
          value={draft.baseUrl}
          onChange={(e) => onChange({ ...draft, baseUrl: e.target.value })}
          disabled={disabled}
        />
      )}
      {draft.provider === "anthropic" ? (
        <select
          className="nk-input"
          aria-label="Model"
          value={draft.model}
          onChange={(e) => onChange({ ...draft, model: e.target.value })}
          disabled={disabled}
        >
          {AGENT_MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label} — {m.hint}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="nk-input"
          placeholder="Model id — mis. minimax/MiniMax-M2.1"
          value={draft.model}
          onChange={(e) => onChange({ ...draft, model: e.target.value })}
          disabled={disabled}
        />
      )}
      <textarea
        className="nk-input"
        placeholder="System prompt — persona & rules (e.g. “Kamu asisten penulisan bahasa Indonesia yang ringkas dan tidak bertele-tele.”)"
        value={draft.systemPrompt}
        onChange={(e) => onChange({ ...draft, systemPrompt: e.target.value })}
        disabled={disabled}
        rows={3}
        style={{ resize: "vertical", fontFamily: "inherit" }}
      />
      <div className="nk-agent-perm">
        <span className="nk-agent-perm-label">
          Permissions
          <span className="nk-agent-perm-hint">
            {draft.toolPermissions === "read-write"
              ? "Can create, edit & delete notes (with your approval)"
              : "Can only read & search — cannot change your vault"}
          </span>
        </span>
        <div className="nk-seg" role="group" aria-label="Tool permissions">
          <button
            type="button"
            className={`nk-seg-btn${draft.toolPermissions === "read-only" ? " is-active" : ""}`}
            onClick={() => onChange({ ...draft, toolPermissions: "read-only" })}
            disabled={disabled}
          >
            Read-only
          </button>
          <button
            type="button"
            className={`nk-seg-btn${draft.toolPermissions === "read-write" ? " is-active" : ""}`}
            onClick={() => onChange({ ...draft, toolPermissions: "read-write" })}
            disabled={disabled}
          >
            Read &amp; write
          </button>
        </div>
      </div>

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
