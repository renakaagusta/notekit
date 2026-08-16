import { Check, Lightbulb, Lock, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  DEFAULT_AGENT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  agentKeySecretName,
  type AgentProfile,
  type AgentToolPermissions,
  type AgentProvider,
} from "../lib/agents-api";
import { gravatarUrlFor } from "../lib/gravatar";
import { listSecretNames, setSecret, removeSecret } from "../lib/secrets-vault";
import { useCryptoStore } from "../stores/cryptoStore";
import { SkeletonCommitList } from "./Skeleton";

export interface AgentFocusPulse {
  slug: string;
  seq: number;
}

interface AgentsViewProps {
  /** Scroll this agent into view and flash-highlight it (e.g. from search). */
  focusAgent?: AgentFocusPulse | null;
}

const CSS_INPUT = "nk-input" as const;
const MONO_FONT = "var(--mono-font)" as const;
const GAP_2 = "var(--gap-2)" as const;

/** Anthropic models offered in the profile picker. Keep labels human-friendly. */
export const AGENT_MODELS: { value: string; label: string; hint: string }[] = [
  { value: "claude-3-5-haiku-latest", label: "Haiku 3.5", hint: "Cepat & murah" },
  { value: "claude-sonnet-4-5", label: "Sonnet 4.5", hint: "Seimbang" },
  { value: "claude-opus-4-1", label: "Opus 4.1", hint: "Paling pintar" },
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
  apiKey: string;
}

const EMPTY_DRAFT: DraftFields = {
  name: "",
  email: "",
  description: "",
  emoji: "",
  model: DEFAULT_AGENT_MODEL,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  toolPermissions: "read-only",
  provider: "anthropic",
  baseUrl: "",
  apiKey: "",
};

// eslint-disable-next-line max-lines-per-function -- AgentsView is the root agents component: list, create, edit, reveal, and key-storage UX all in one surface
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

  // Per-profile API keys live encrypted in the vault under agentkey-<slug>.
  const device = useCryptoStore((s) => s.device);
  const cryptoPhase = useCryptoStore((s) => s.phase);
  const [keyStoredSlugs, setKeyStoredSlugs] = useState<Set<string>>(new Set());

  async function refreshKeyStatus() {
    if (!device || cryptoPhase !== "ready") return;
    try {
      const names = await listSecretNames();
      const slugs = names
        .filter((n) => n.startsWith("agentkey-"))
        .map((n) => n.slice("agentkey-".length));
      setKeyStoredSlugs(new Set(slugs));
    } catch {
      /* vault not readable yet */
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refreshKeyStatus is async; setState is called in a resolved promise, not synchronously
    void refreshKeyStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally omitted; effect triggers only on the listed values
  }, [device, cryptoPhase]);

  /** Persist (or clear) a profile's key in the encrypted vault. */
  async function saveProfileKey(slug: string, key: string) {
    if (!device) return;
    const trimmed = key.trim();
    if (!trimmed) return; // empty on edit means "keep existing"
    await setSecret(agentKeySecretName(slug), trimmed, device);
    await refreshKeyStatus();
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh is async; setState is called inside an awaited promise, not synchronously
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
      await saveProfileKey(res.agent.slug, newDraft.apiKey);
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
      apiKey: "",
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
      await saveProfileKey(editingSlug, editDraft.apiKey);
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
      if (device && keyStoredSlugs.has(slug)) {
        await removeSecret(agentKeySecretName(slug), device).catch(() => { /* intentional noop — vault key removal is best-effort */ });
      }
      await refreshKeyStatus();
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
          gap: GAP_2,
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
          <div style={{ display: "flex", gap: GAP_2 }}>
            <input
              className={CSS_INPUT}
              readOnly
              value={reveal.token}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: 1, fontFamily: MONO_FONT }}
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
              gap: GAP_2,
              paddingTop: GAP_2,
              borderTop: "1px solid rgba(245, 197, 24, 0.25)",
            }}
          >
            <img className="nk-commit-avatar" src={gravatarUrlFor(reveal.email)} alt="" />
            <div style={{ flex: 1, fontSize: "0.9em" }}>
              To give this agent a profile picture, register{" "}
              <code style={{ fontFamily: MONO_FONT }}>{reveal.email}</code>{" "}
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
                  keyStored={keyStoredSlugs.has(a.slug)}
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
                      <code style={{ fontFamily: MONO_FONT }}>
                        {a.email}
                      </code>
                      {" · "}
                      created {formatTime(a.createdAt)}
                      {" · "}
                      <code style={{ fontFamily: MONO_FONT }}>
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
  /** Whether this profile already has a key saved (edit mode). */
  keyStored?: boolean;
}

interface ModelPickerProps {
  provider: AgentProvider;
  model: string;
  models: string[];
  loadingModels: boolean;
  modelError: string | null;
  disabled?: boolean;
  onModelChange(model: string): void;
  onLoadModels(): void;
}

function ModelPicker({
  provider,
  model,
  models,
  loadingModels,
  modelError,
  disabled,
  onModelChange,
  onLoadModels,
}: ModelPickerProps) {
  if (provider === "anthropic") {
    return (
      <select
        className={CSS_INPUT}
        aria-label="Model"
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={disabled}
      >
        {AGENT_MODELS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label} — {m.hint}
          </option>
        ))}
      </select>
    );
  }
  return (
    <>
      <div style={{ display: "flex", gap: GAP_2 }}>
        {models.length > 0 ? (
          <select
            className={CSS_INPUT}
            aria-label="Model"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={disabled}
            style={{ flex: 1 }}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={CSS_INPUT}
            placeholder={
              loadingModels
                ? "Memuat daftar model…"
                : "Model id — isi Base URL & key untuk memuat daftar"
            }
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={disabled}
            style={{ flex: 1 }}
          />
        )}
        <button
          type="button"
          className="nk-btn"
          onClick={onLoadModels}
          disabled={disabled || loadingModels}
          title="Ambil daftar model dari endpoint"
        >
          {loadingModels ? "Memuat…" : models.length ? "Muat ulang" : "Muat model"}
        </button>
      </div>
      {modelError && <p className="nk-inline-ai-error">{modelError}</p>}
    </>
  );
}

// eslint-disable-next-line max-lines-per-function -- AgentForm renders the full agent profile form; ModelPicker extracted but remaining branches (provider/key/permission/avatar) are each required UI sections
function AgentForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  disabled,
  emailHint,
  autoFocus,
  keyStored,
}: AgentFormProps) {
  // For OpenAI-compatible endpoints we can list models from the standard
  // `/models` route, so the user picks from a dropdown instead of typing an id.
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  async function loadModels() {
    const base = draft.baseUrl.trim().replace(/\/+$/, "");
    const key = draft.apiKey.trim();
    if (!base) return setModelError("Isi Base URL dulu.");
    if (!key) return setModelError("Isi API key dulu (untuk memuat daftar model).");
    setLoadingModels(true);
    setModelError(null);
    try {
      const res = await fetch(`${base}/models`, {
        headers: { authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { data?: { id?: string }[] };
      const ids = (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => !!id);
      if (!ids.length) throw new Error("Endpoint tak mengembalikan model.");
      setModels(ids);
      if (!draft.model || !ids.includes(draft.model)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- ids is non-empty: the `!ids.length` guard above throws if empty
        onChange({ ...draft, model: ids[0]! });
      }
    } catch (e) {
      setModelError((e as Error).message);
    } finally {
      setLoadingModels(false);
    }
  }

  // Auto-load models once both Base URL and API key are filled — no button click
  // needed. Debounced so it fires after the user finishes pasting/typing.
  useEffect(() => {
    if (draft.provider !== "openai-compatible") return;
    if (!draft.baseUrl.trim() || !draft.apiKey.trim()) return;
    const id = setTimeout(() => void loadModels(), 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally omitted; effect triggers only on the listed values
  }, [draft.provider, draft.baseUrl, draft.apiKey]);

  return (
    <div
      style={{
        padding: "var(--gap-3)",
        display: "flex",
        flexDirection: "column",
        gap: GAP_2,
      }}
    >
      <input
        className={CSS_INPUT}
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
        className={CSS_INPUT}
        placeholder={
          emailHint ??
          "Email (optional — server picks a default if you leave it blank; pick a Gravatar-registered email to get a real avatar)"
        }
        value={draft.email}
        onChange={(e) => onChange({ ...draft, email: e.target.value })}
        disabled={disabled}
      />
      <textarea
        className={CSS_INPUT}
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
      <select
        className={CSS_INPUT}
        aria-label="Provider"
        value={draft.provider}
        onChange={(e) => {
          const provider = e.target.value as AgentProvider;
          // Reset the model to a sensible default when switching family.
          const model = provider === "anthropic" ? DEFAULT_AGENT_MODEL : "";
          onChange({ ...draft, provider, model });
        }}
        disabled={disabled}
      >
        <option value="anthropic">Anthropic</option>
        <option value="openai-compatible">OpenAI-compatible</option>
      </select>

      {draft.provider === "openai-compatible" && (
        <input
          className={CSS_INPUT}
          placeholder="Base URL — mis. https://9router.stackbase.id/v1"
          value={draft.baseUrl}
          onChange={(e) => onChange({ ...draft, baseUrl: e.target.value })}
          disabled={disabled}
        />
      )}

      {/* API key comes before model — for openai-compatible we need the key to
          fetch the model list. */}
      <input
        className={CSS_INPUT}
        type="password"
        autoComplete="off"
        placeholder={
          keyStored
            ? "API key tersimpan — isi untuk mengganti"
            : draft.provider === "anthropic"
              ? "API key — sk-ant-…"
              : "API key — sk-…"
        }
        value={draft.apiKey}
        onChange={(e) => onChange({ ...draft, apiKey: e.target.value })}
        disabled={disabled}
      />
      <p className="nk-agent-keybox-hint">
        <Lock size={12} aria-hidden /> Key disimpan terenkripsi di vault (tak ikut
        di file profil), dipanggil langsung ke provider — tanpa relay NoteKit.
      </p>

      <ModelPicker
        provider={draft.provider}
        model={draft.model}
        models={models}
        loadingModels={loadingModels}
        modelError={modelError}
        disabled={disabled}
        onModelChange={(model) => onChange({ ...draft, model })}
        onLoadModels={loadModels}
      />

      <textarea
        className={CSS_INPUT}
        placeholder={'System prompt — persona & rules (e.g. “Kamu asisten penulisan bahasa Indonesia yang ringkas dan tidak bertele-tele.”)'}
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
            gap: GAP_2,
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
            <code style={{ fontFamily: MONO_FONT }}>
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
      <div style={{ display: "flex", gap: GAP_2 }}>
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
