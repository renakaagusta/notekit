import { Camera, Check, FileText, History, ImagePlus, ListChecks, Loader2, Lock, Plus, Search, Send, Sparkles, TextSelect, Trash2, Wrench, X } from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";
import {
  listAgents,
  agentKeySecretName,
  DEFAULT_AGENT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  type AgentProfile,
} from "../lib/agents-api";
import { streamAssistant, type AssistantMessage } from "../lib/ai-agent";
import { buildAssistantTools, describeToolCall } from "../lib/ai-tools";
import { renderAssistantHtml } from "../lib/chat-markdown";
import {
  listChatSessions,
  readCachedChatSessions,
  readChatSession,
  writeChatSession,
  deleteChatSession,
  deriveTitle,
  chatTimestamp,
  type ChatSession,
} from "../lib/chats-vault";
import { noteTitle } from "../lib/note-display";
import { listSecretNames } from "../lib/secrets-vault";
import { useAIChatStore, messageText } from "../stores/aiChatStore";
import { useCryptoStore } from "../stores/cryptoStore";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { useVaultStore } from "../stores/vaultStore";

interface Props {
  /** Open the Agents manager so the user can create their first profile / add a key. */
  onOpenAgents?: () => void;
  /** Bumped when the Agents modal closes, so we re-check setup state. */
  refreshTick?: number;
}


function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Downscale an image blob to a JPEG data URL (≤~1280px) to keep payloads small. */
async function toResizedDataUrl(blob: Blob, max = 1280): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  // PNG keeps crisp text (screenshots); JPEG for photos would blur diagrams.
  return canvas.toDataURL("image/png");
}

/** Compact relative time for the history list ("2m", "3h", "5d"). */
function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

// eslint-disable-next-line max-lines-per-function, complexity -- large React component; multiple UI states (loading, setup, history, chat) with shared closure; cannot split without prop-drilling
export function AIAssistantPanel({ onOpenAgents, refreshTick }: Props) {
  const open = useAIChatStore((s) => s.open);
  const setOpen = useAIChatStore((s) => s.setOpen);
  const messages = useAIChatStore((s) => s.messages);
  const streaming = useAIChatStore((s) => s.streaming);
  const error = useAIChatStore((s) => s.error);
  const selectedAgentSlug = useAIChatStore((s) => s.selectedAgentSlug);
  const selectAgent = useAIChatStore((s) => s.selectAgent);
  const includeNoteContext = useAIChatStore((s) => s.includeNoteContext);
  const setIncludeNoteContext = useAIChatStore((s) => s.setIncludeNoteContext);
  const contextItems = useAIChatStore((s) => s.contextItems);
  const addContext = useAIChatStore((s) => s.addContext);
  const removeContext = useAIChatStore((s) => s.removeContext);
  const pendingApproval = useAIChatStore((s) => s.pendingApproval);
  const sessions = useAIChatStore((s) => s.sessions);
  const currentSessionId = useAIChatStore((s) => s.currentSessionId);
  const setSessions = useAIChatStore((s) => s.setSessions);
  const startNewSession = useAIChatStore((s) => s.startNewSession);
  const loadSessionMessages = useAIChatStore((s) => s.loadSessionMessages);

  const device = useCryptoStore((s) => s.device);
  const cryptoPhase = useCryptoStore((s) => s.phase);

  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const notes = useNotesStore((s) => s.notes);
  const allNotes = useNotesStore((s) => s.all());
  const tickets = useTicketsStore((s) => s.all());
  const activeNote = activeNoteId ? notes[activeNoteId] ?? null : null;
  const defaultFolder = useVaultStore((s) => s.activeSettings?.defaultFolder ?? null);

  const [agents, setAgents] = useState<AgentProfile[] | null>(null);
  const [keyStoredSlugs, setKeyStoredSlugs] = useState<Set<string> | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  // Remember createdAt across saves of the same session (title stays derived).
  const sessionCreatedRef = useRef<string | null>(null);
  // Queue of approvals — the model may fire several mutating tools (even in
  // parallel), and each needs its own confirmation. A single slot would let
  // later requests clobber earlier ones and deadlock the stream.
  const approvalQueue = useRef<
    { id: string; toolName: string; summary: string; input: unknown; resolve: (ok: boolean) => void }[]
  >([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load agents + key status when the panel opens or setup state changes
  // (e.g. after the Agents modal closes). Picks up newly-created profiles/keys.
  useEffect(() => {
    if (!open || cryptoPhase !== "ready") return;
    let cancelled = false;
    void (async () => {
      try {
        const names = await listSecretNames();
        if (!cancelled)
          setKeyStoredSlugs(
            new Set(
              names
                .filter((n) => n.startsWith("agentkey-"))
                .map((n) => n.slice("agentkey-".length)),
            ),
          );
      } catch {
        if (!cancelled) setKeyStoredSlugs(new Set());
      }
      try {
        const res = await listAgents();
        if (cancelled) return;
        setAgents(res.agents);
        if (!selectedAgentSlug && res.agents[0]) selectAgent(res.agents[0].slug);
      } catch {
        if (!cancelled) setAgents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally omitted; effect triggers only on the listed values
  }, [open, cryptoPhase, refreshTick]);

  // Load the encrypted session index when the panel opens & the vault is ready.
  useEffect(() => {
    if (!open || cryptoPhase !== "ready" || !device) return;
    let cancelled = false;
    let gotNetwork = false;
    // Cache-then-network (stale-while-revalidate): paint history from the local
    // ciphertext cache instantly (works offline), then revalidate over the
    // network and swap. The cache read never overrides a network result that
    // already landed.
    void (async () => {
      const cached = await readCachedChatSessions(device);
      if (!cancelled && !gotNetwork && cached) setSessions(cached);
    })();
    void (async () => {
      try {
        const list = await listChatSessions(device);
        gotNetwork = true;
        if (!cancelled) setSessions(list);
      } catch {
        // Offline / fetch failed — keep whatever the cache painted.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally omitted; effect triggers only on the listed values
  }, [open, cryptoPhase]);

  // Track the live document selection so we can offer it as scoped context.
  useEffect(() => {
    if (!open) return;
    function onSel() {
      const t = window.getSelection()?.toString().trim() ?? "";
      setSelection(t.length > 0 && t.length < 8000 ? t : "");
    }
    onSel();
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [open]);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pendingApproval]);

  // Auto-grow the composer to fit its content (up to the CSS max-height).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft, open]);

  if (!open) return null;

  const selectedAgent =
    agents?.find((a) => a.slug === selectedAgentSlug) ?? agents?.[0] ?? null;

  // eslint-disable-next-line max-lines-per-function, complexity -- send handler coordinates context-building, streaming, tool approval, and session persistence across multiple branch paths
  async function onSend() {
    const text = draft.trim();
    const images = attachments;
    if ((!text && images.length === 0) || streaming || !device || !selectedAgent) return;

    const store = useAIChatStore.getState();
    // Reconstruct prior turns as multimodal messages so earlier images stay in
    // context across turns.
    const prior: AssistantMessage[] = store.messages.map((m) => {
      const imgs = m.parts.filter(
        (p): p is { kind: "image"; url: string } => p.kind === "image",
      );
      const txt = messageText(m);
      if (imgs.length === 0) return { role: m.role, content: txt };
      return {
        role: m.role,
        content: [
          ...(txt ? [{ type: "text" as const, text: txt }] : []),
          ...imgs.map((i) => ({ type: "image" as const, image: i.url })),
        ],
      };
    });

    // Build the scoped context block: selection + active note + pinned items.
    let contextBlock = "";
    if (selection) {
      contextBlock += `[Context — selected text]\n${selection}\n\n`;
    }
    if (includeNoteContext && activeNote) {
      contextBlock += `[Context — active note "${noteTitle(activeNote)}"]\n${activeNote.body}\n\n`;
    }
    for (const item of store.contextItems) {
      if (item.kind === "note") {
        const n = useNotesStore.getState().notes[item.id];
        if (n) contextBlock += `[Context — note "${noteTitle(n)}"]\n${n.body}\n\n`;
      } else {
        const tk = useTicketsStore.getState().all().find((x) => x.id === item.id);
        if (tk)
          contextBlock += `[Context — task "${tk.title}" (status: ${tk.status})]\n${tk.body}\n\n`;
      }
    }

    setDraft("");
    setAttachments([]);
    store.pushUser(text, images);
    const assistantId = store.startAssistant();
    store.setStreaming(true);

    // Build the new user message: multimodal when images are attached.
    const userText = contextBlock + text;
    const userContent =
      images.length > 0
        ? [
            ...(userText ? [{ type: "text" as const, text: userText }] : []),
            ...images.map((url) => ({ type: "image" as const, image: url })),
          ]
        : userText;

    const controller = new AbortController();
    abortRef.current = controller;

    const permissions = selectedAgent.toolPermissions ?? "read-only";
    const tools = buildAssistantTools({ requestApproval, defaultFolder }, permissions);

    let system = selectedAgent.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
    system +=
      "\n\nYou have tools for: notes (list_notes, search_notes, read_note), folders (list_folders), links (list_links), tasks (list_tasks), secret names (list_secrets — NAMES only, never values), git commit history (recent_activity), and opening/closing tabs" +
      (permissions === "read-write"
        ? ". You can also create/edit/delete notes, save links, create tasks & change their status — every change requires the user's approval first."
        : ".") +
      " When asked about the whole vault, use list_notes (not search_notes). You can NEVER read secret VALUES, only their names. Use tools when relevant." +
      // MiniMax and other smaller models sometimes NARRATE an action ("✅ done, I
      // updated the note") without actually emitting the tool call. Forbid that.
      "\n\nCRITICAL: You may ONLY claim a note/link/task was created, updated, or deleted if you ACTUALLY called the matching tool (create_note / update_note / delete_note / create_link / create_task / set_task_status) in THIS reply and it returned success. Never say \"done\", \"sudah\", \"✅\", or describe a change you did not perform via a tool call. To change a note's content you MUST call update_note with the note's id and the COMPLETE new body — describing the change in text does nothing. If a task needs a tool, call the tool first, then confirm based on its result." +
      "\n\nAlways reply in the same language the user writes in.";

    try {
      await streamAssistant({
        device,
        keySecretName: agentKeySecretName(selectedAgent.slug),
        provider: selectedAgent.provider ?? "anthropic",
        baseUrl: selectedAgent.baseUrl,
        model: selectedAgent.model ?? DEFAULT_AGENT_MODEL,
        system,
        messages: [...prior, { role: "user", content: userContent }],
        tools,
        maxSteps: 16,
        signal: controller.signal,
        onDelta: (d) => useAIChatStore.getState().appendDelta(assistantId, d),
        onToolCall: (c) =>
          useAIChatStore
            .getState()
            .addToolNote(assistantId, describeToolCall(c.toolName, c.input)),
        onToolsUnsupported: () =>
          useAIChatStore
            .getState()
            .addToolNote(assistantId, "Model ini tak mendukung tools — dijawab sebagai chat biasa"),
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        useAIChatStore.getState().setError((e as Error).message);
      }
    } finally {
      drainApprovals(); // clear any approvals left dangling if the run ended early
      // If tools ran but the model gave no closing text, don't leave it hanging.
      const msg = useAIChatStore.getState().messages.find((m) => m.id === assistantId);
      if (msg && !messageText(msg).trim() && msg.parts.some((p) => p.kind === "tool")) {
        useAIChatStore.getState().appendDelta(assistantId, "Selesai.");
      }
      useAIChatStore.getState().finishAssistant(assistantId);
      useAIChatStore.getState().setStreaming(false);
      abortRef.current = null;
      void persistCurrentSession();
    }
  }

  /** Encrypt + commit the current transcript to the vault, then refresh the list. */
  async function persistCurrentSession() {
    const st = useAIChatStore.getState();
    if (!device || st.messages.length === 0) return;
    let id = st.currentSessionId;
    if (!id) {
      id = nanoid();
      st.setCurrentSessionId(id);
    }
    const ts = chatTimestamp();
    if (!sessionCreatedRef.current) sessionCreatedRef.current = ts;
    const session: ChatSession = {
      id,
      title: deriveTitle(st.messages),
      agentSlug: st.selectedAgentSlug,
      messages: st.messages,
      createdAt: sessionCreatedRef.current,
      updatedAt: ts,
    };
    try {
      await writeChatSession(session, device);
      const list = await listChatSessions(device);
      setSessions(list);
    } catch {
      // Non-fatal: chat still works in-memory.
    }
  }

  /** Open a saved conversation from the history list. */
  async function openSession(id: string) {
    if (!device) return;
    setShowHistory(false);
    setHistoryQuery("");
    try {
      const session = await readChatSession(id, device);
      if (session) {
        loadSessionMessages(id, session.messages);
        sessionCreatedRef.current = session.createdAt;
      }
    } catch {
      /* intentional */
    }
  }

  /** Start a fresh conversation (nothing committed until the first turn). */
  function newChat() {
    startNewSession();
    sessionCreatedRef.current = null;
    setShowHistory(false);
    setHistoryQuery("");
  }

  /** Delete a saved conversation. If it's the open one, reset to a fresh chat. */
  async function removeSession(id: string) {
    if (!device) return;
    try {
      await deleteChatSession(id, device);
      const list = await listChatSessions(device);
      setSessions(list);
      if (useAIChatStore.getState().currentSessionId === id) newChat();
    } catch {
      /* intentional */
    }
  }

  /** Show the head of the approval queue (or clear it). */
  function showNextApproval() {
    const next = approvalQueue.current[0];
    useAIChatStore
      .getState()
      .setPendingApproval(
        next
          ? { id: next.id, toolName: next.toolName, summary: next.summary, input: next.input }
          : null,
      );
  }

  /** A mutating tool awaits this until the user clicks Approve/Reject. Multiple
   *  requests queue up and are shown one at a time. */
  function requestApproval(toolName: string, summary: string, input: unknown): Promise<boolean> {
    return new Promise((resolve) => {
      approvalQueue.current.push({ id: nanoid(), toolName, summary, input, resolve });
      if (approvalQueue.current.length === 1) showNextApproval();
    });
  }

  function resolveApproval(ok: boolean) {
    const item = approvalQueue.current.shift();
    item?.resolve(ok);
    showNextApproval();
  }

  /** Reject everything still queued — used when the run is stopped/aborted. */
  function drainApprovals() {
    const q = approvalQueue.current;
    approvalQueue.current = [];
    q.forEach((i) => i.resolve(false));
    useAIChatStore.getState().setPendingApproval(null);
  }

  function onStop() {
    drainApprovals(); // release every pending tool so the loop can unwind
    abortRef.current?.abort();
  }

  /** Add image blobs (from picker/paste/drop) as resized data-URL attachments. */
  async function addImageBlobs(blobs: Blob[]) {
    const imgs = blobs.filter((b) => b.type.startsWith("image/"));
    if (!imgs.length) return;
    const urls = await Promise.all(
      imgs.map((b) => toResizedDataUrl(b).catch(() => null)),
    );
    const ok = urls.filter((u): u is string => !!u);
    if (ok.length) setAttachments((a) => [...a, ...ok].slice(0, 6));
  }

  function onPasteComposer(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const blobs = items
      .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (blobs.length) {
      e.preventDefault();
      void addImageBlobs(blobs);
    }
  }

  /** Capture the active note's rendered view (incl. interactive embeds) as an
   *  image and attach it — so the AI can literally SEE the note. Uses Electron's
   *  page capture when available (only real way to grab sandboxed-iframe pixels). */
  async function captureNote() {
    const capture = (
      window as unknown as {
        notekit?: {
          app?: {
            capturePage?: (rect?: {
              x: number;
              y: number;
              width: number;
              height: number;
            }) => Promise<string | null>;
          };
        };
      }
    ).notekit?.app?.capturePage;
    if (!capture) {
      useAIChatStore
        .getState()
        .setError("Capture butuh aplikasi desktop NoteKit (belum tersedia di web).");
      return;
    }
    setCapturing(true);
    try {
      // Screenshot the active editor region (includes sandboxed-iframe embeds,
      // which only a real page capture can grab).
      const el =
        document.querySelector(".nk-editor-wrap") ??
        document.querySelector(".nk-editor") ??
        document.body;
      const r = el.getBoundingClientRect();
      const dataUrl = await capture(
        r.width > 0 && r.height > 0
          ? { x: r.x, y: r.y, width: r.width, height: r.height }
          : undefined,
      );
      if (dataUrl) setAttachments((a) => [...a, dataUrl].slice(0, 6));
      else useAIChatStore.getState().setError("Capture kosong — coba buka catatan dulu.");
    } catch (e) {
      useAIChatStore.getState().setError(`Gagal capture: ${(e as Error).message}`);
    } finally {
      setCapturing(false);
    }
  }

  const notReady = cryptoPhase !== "ready";
  const loaded = agents !== null && keyStoredSlugs !== null;
  const noAgents = agents !== null && agents.length === 0;
  // The selected profile needs its own key saved.
  const noKey =
    keyStoredSlugs !== null && !!selectedAgent && !keyStoredSlugs.has(selectedAgent.slug);
  // Needs setup if the vault is ready but the selected profile's key or a profile is missing.
  const needsSetup = !notReady && loaded && (noKey || noAgents);

  return (
    <aside className="nk-ai-panel">
      <header className="nk-ai-panel-hd">
        <span className="nk-ai-panel-title">
          <Sparkles size={15} aria-hidden /> AI
        </span>
        {agents && agents.length > 0 && (
          <select
            className="nk-ai-agent-picker"
            value={selectedAgent?.slug ?? ""}
            onChange={(e) => selectAgent(e.target.value)}
            aria-label="AI profile"
            title="Pilih profil AI"
          >
            {agents.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.emoji ? `${a.emoji} ` : ""}
                {a.name}
              </option>
            ))}
          </select>
        )}
        {!notReady && loaded && !needsSetup && (
          <>
            <button
              className="nk-iconbtn"
              onClick={newChat}
              aria-label="Obrolan baru"
              title="Obrolan baru"
            >
              <Plus size={15} aria-hidden />
            </button>
            <button
              className={`nk-iconbtn${showHistory ? " is-on" : ""}`}
              onClick={() => setShowHistory((v) => !v)}
              aria-label="Riwayat obrolan"
              title="Riwayat"
            >
              <History size={15} aria-hidden />
            </button>
          </>
        )}
        <button
          className="nk-iconbtn"
          onClick={() => setOpen(false)}
          aria-label="Tutup asisten"
          title="Tutup"
        >
          <X size={15} aria-hidden />
        </button>
      </header>

      {notReady ? (
        <div className="nk-ai-gate">
          <Sparkles size={30} aria-hidden />
          <p>Vault belum siap.</p>
          <p className="nk-ai-gate-hint">
            Buka & buka-kunci vault terenkripsi dulu untuk memakai asisten AI.
          </p>
        </div>
      ) : needsSetup ? (
        <div className="nk-ai-gate">
          <Sparkles size={30} aria-hidden />
          <p>Siapkan AI dulu</p>
          <p className="nk-ai-gate-hint">
            {noAgents
              ? "Buat satu profil AI (provider, key, model) untuk mulai."
              : "Profil ini belum punya API key. Buka profil di pengaturan AI untuk mengisinya."}
          </p>
          {onOpenAgents && (
            <button className="nk-btn nk-btn--primary" onClick={onOpenAgents}>
              <Sparkles size={14} aria-hidden />{" "}
              {noKey ? "Buka pengaturan AI" : "Buat profil AI"}
            </button>
          )}
        </div>
      ) : !loaded ? (
        <div className="nk-ai-gate">
          <Loader2 size={22} className="nk-ai-spin" aria-hidden />
        </div>
      ) : showHistory ? (
        <div className="nk-ai-history-page">
          <div className="nk-ai-history-search">
            <Search size={14} aria-hidden />
            <input
              className="nk-ai-history-search-input"
              placeholder="Cari riwayat obrolan…"
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              autoFocus
            />
            {historyQuery && (
              <button
                className="nk-ai-history-search-clear"
                onClick={() => setHistoryQuery("")}
                aria-label="Bersihkan pencarian"
              >
                <X size={13} aria-hidden />
              </button>
            )}
          </div>
          <div className="nk-ai-history-list">
            {(() => {
              const q = historyQuery.trim().toLowerCase();
              const hits = q
                ? sessions.filter((s) => (s.title || "").toLowerCase().includes(q))
                : sessions;
              if (sessions.length === 0)
                return (
                  <div className="nk-ai-history-empty">
                    <History size={26} aria-hidden />
                    <p>Belum ada riwayat obrolan.</p>
                  </div>
                );
              if (hits.length === 0)
                return <div className="nk-ai-history-empty"><p>Tak ada yang cocok.</p></div>;
              return hits.map((s) => (
                <div
                  key={s.id}
                  className={`nk-ai-history-row${s.id === currentSessionId ? " is-active" : ""}`}
                >
                  <button
                    className="nk-ai-history-open"
                    onClick={() => void openSession(s.id)}
                    title={s.title}
                  >
                    <History size={13} aria-hidden />
                    <span className="nk-ai-history-title">{s.title}</span>
                    <span className="nk-ai-history-time">{relTime(s.updatedAt)}</span>
                  </button>
                  <button
                    className="nk-ai-history-del"
                    onClick={() => void removeSession(s.id)}
                    aria-label="Hapus obrolan"
                    title="Hapus"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </div>
              ));
            })()}
          </div>
        </div>
      ) : (
        <>
          {/* Context chips — selection + active note + pinned notes/tasks + add. */}
          <div className="nk-ai-chips">
            {selection && (
              <span className="nk-ai-chip is-selection">
                <TextSelect size={12} aria-hidden />
                {wordCount(selection)} words
              </span>
            )}
            {activeNote && !contextItems.some((c) => c.id === activeNoteId) && (
              <button
                className={`nk-ai-chip${includeNoteContext ? " is-on" : ""}`}
                onClick={() => setIncludeNoteContext(!includeNoteContext)}
                title="Toggle the active note as context"
              >
                <FileText size={12} aria-hidden />
                {noteTitle(activeNote)}
                {includeNoteContext && <X size={11} aria-hidden />}
              </button>
            )}
            {contextItems.map((c) => (
              <span key={c.id} className="nk-ai-chip is-on">
                {c.kind === "task" ? (
                  <ListChecks size={12} aria-hidden />
                ) : (
                  <FileText size={12} aria-hidden />
                )}
                {c.title}
                <button
                  className="nk-ai-chip-x"
                  onClick={() => removeContext(c.id)}
                  aria-label="Remove context"
                >
                  <X size={11} aria-hidden />
                </button>
              </span>
            ))}
            <div className="nk-ai-ctx-add">
              <button
                className="nk-ai-chip nk-ai-chip--add"
                onClick={() => setPickerOpen((v) => !v)}
                title="Add a note or task as context"
                aria-label="Add context"
              >
                <Plus size={13} aria-hidden />
              </button>
              {pickerOpen && (
                <div className="nk-ai-ctx-picker">
                  <input
                    className="nk-ai-ctx-search"
                    placeholder="Search notes & tasks…"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    autoFocus
                  />
                  <div className="nk-ai-ctx-list">
                    {(() => {
                      const q = pickerQuery.toLowerCase();
                      const pinned = new Set(contextItems.map((c) => c.id));
                      const noteHits = allNotes
                        .filter((n) => !pinned.has(n.id) && noteTitle(n).toLowerCase().includes(q))
                        .slice(0, 8);
                      const taskHits = tickets
                        .filter((t) => !pinned.has(t.id) && t.title.toLowerCase().includes(q))
                        .slice(0, 6);
                      if (!noteHits.length && !taskHits.length)
                        return <div className="nk-ai-ctx-empty">No matches</div>;
                      return (
                        <>
                          {noteHits.map((n) => (
                            <button
                              key={n.id}
                              className="nk-ai-ctx-item"
                              onClick={() => {
                                addContext({ kind: "note", id: n.id, title: noteTitle(n) });
                                setPickerQuery("");
                              }}
                            >
                              <FileText size={12} aria-hidden /> {noteTitle(n)}
                            </button>
                          ))}
                          {taskHits.map((t) => (
                            <button
                              key={t.id}
                              className="nk-ai-ctx-item"
                              onClick={() => {
                                addContext({ kind: "task", id: t.id, title: t.title });
                                setPickerQuery("");
                              }}
                            >
                              <ListChecks size={12} aria-hidden /> {t.title}
                            </button>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="nk-ai-body" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="nk-ai-empty">
                <Sparkles size={22} aria-hidden />
                <p>Tanya apa saja tentang catatanmu.</p>
              </div>
            ) : (
              messages.map((m) => {
                const last = m.parts[m.parts.length - 1];
                const showCaret = m.pending && (!last || last.kind === "tool");
                return (
                  <div key={m.id} className="nk-ai-turn">
                    {m.parts.map((p, i) => {
                      if (p.kind === "tool")
                        return (
                          <div key={i} className="nk-ai-toolnote">
                            <Wrench size={11} aria-hidden /> {p.label}
                          </div>
                        );
                      if (p.kind === "image")
                        return (
                          <img
                            key={i}
                            className="nk-ai-msg-img"
                            src={p.url}
                            alt="Lampiran gambar"
                            loading="lazy"
                          />
                        );
                      if (m.role === "assistant") {
                        // A text part that was pure <think> reasoning renders to
                        // empty HTML — skip it so we don't draw a blank bubble.
                        const html = renderAssistantHtml(p.text);
                        if (!html) return null;
                        return (
                          <div
                            key={i}
                            className="nk-ai-msg nk-ai-msg--assistant nk-ai-prose"
                            dangerouslySetInnerHTML={{ __html: html }}
                          />
                        );
                      }
                      return (
                        <div key={i} className="nk-ai-msg nk-ai-msg--user">
                          {p.text}
                        </div>
                      );
                    })}
                    {showCaret && (
                      <div className="nk-ai-msg nk-ai-msg--assistant">
                        <span className="nk-ai-caret">▍</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {pendingApproval && (
              <div className="nk-ai-approval">
                <div className="nk-ai-approval-hd">
                  <Wrench size={13} aria-hidden /> Perlu persetujuan
                </div>
                <div className="nk-ai-approval-summary">{pendingApproval.summary}</div>
                <div className="nk-ai-approval-actions">
                  <button
                    className="nk-btn nk-btn--primary"
                    onClick={() => resolveApproval(true)}
                  >
                    <Check size={14} aria-hidden /> Setujui
                  </button>
                  <button className="nk-btn" onClick={() => resolveApproval(false)}>
                    <X size={14} aria-hidden /> Tolak
                  </button>
                </div>
              </div>
            )}
            {error && <div className="nk-ai-error">{error}</div>}
          </div>

          {attachments.length > 0 && (
            <div className="nk-ai-attachments">
              {attachments.map((url, i) => (
                <div key={i} className="nk-ai-attachment">
                  <img src={url} alt="Lampiran" />
                  <button
                    className="nk-ai-attachment-x"
                    onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}
                    aria-label="Hapus lampiran"
                  >
                    <X size={11} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="nk-ai-composer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addImageBlobs(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <button
              className="nk-ai-attachbtn"
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              title="Lampirkan gambar"
              aria-label="Lampirkan gambar"
            >
              <ImagePlus size={16} aria-hidden />
            </button>
            <button
              className="nk-ai-attachbtn"
              onClick={() => void captureNote()}
              disabled={streaming || capturing}
              title="Capture catatan aktif"
              aria-label="Capture catatan"
            >
              {capturing ? (
                <Loader2 size={16} className="nk-ai-spin" aria-hidden />
              ) : (
                <Camera size={16} aria-hidden />
              )}
            </button>
            <textarea
              ref={inputRef}
              className="nk-ai-input"
              placeholder="Tanya asisten…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={onPasteComposer}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              rows={1}
              disabled={streaming}
            />
            {streaming ? (
              <button className="nk-ai-send" onClick={onStop} title="Hentikan" aria-label="Hentikan">
                <Loader2 size={16} className="nk-ai-spin" aria-hidden />
              </button>
            ) : (
              <button
                className="nk-ai-send"
                onClick={() => void onSend()}
                disabled={!draft.trim() && attachments.length === 0}
                title="Kirim (Enter)"
                aria-label="Kirim"
              >
                <Send size={16} aria-hidden />
              </button>
            )}
          </div>
          <div className="nk-ai-privacy">
            <Lock size={11} aria-hidden /> Key kamu, langsung ke provider — tanpa
            relay server NoteKit.
          </div>
        </>
      )}
    </aside>
  );
}
