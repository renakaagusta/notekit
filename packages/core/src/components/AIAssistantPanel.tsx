import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";
import {
  listAgents,
  agentKeySecretName,
  DEFAULT_AGENT_MODEL,
  type AgentProfile,
} from "../lib/agents-api";
import { streamAssistant, type AssistantMessage } from "../lib/ai-agent";
import { buildAssistantTools, describeToolCall } from "../lib/ai-tools";
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
import { listSecretNames } from "../lib/secrets-vault";
import { useAIChatStore, messageText } from "../stores/aiChatStore";
import { useCryptoStore } from "../stores/cryptoStore";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { useVaultStore } from "../stores/vaultStore";
import {
  buildContextBlock,
  buildSystemPrompt,
  PanelBodyView,
  PanelHeaderView,
} from "./AIAssistantPanelParts";

interface Props {
  /** Open the Agents manager so the user can create their first profile / add a key. */
  onOpenAgents?: () => void;
  /** Bumped when the Agents modal closes, so we re-check setup state. */
  refreshTick?: number;
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
// eslint-disable-next-line max-lines-per-function, complexity -- large React component; multiple UI states (loading, setup, history, chat) with shared closure; cannot split without breaking hook order
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

    const contextBlock = buildContextBlock({
      selection,
      includeNoteContext,
      activeNote,
      contextItems: store.contextItems,
      getNoteById: (id) => useNotesStore.getState().notes[id],
      getTicketById: (id) => useTicketsStore.getState().all().find((x) => x.id === id),
    });

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
    const system = buildSystemPrompt(selectedAgent, permissions);

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
      <PanelHeaderView
        agents={agents}
        selectedAgentSlug={selectedAgent?.slug}
        notReady={notReady}
        loaded={loaded}
        needsSetup={needsSetup}
        showHistory={showHistory}
        onSelectAgent={selectAgent}
        onNewChat={newChat}
        onToggleHistory={() => setShowHistory((v) => !v)}
        onClose={() => setOpen(false)}
      />

      <PanelBodyView
        notReady={notReady}
        needsSetup={needsSetup}
        loaded={loaded}
        showHistory={showHistory}
        noAgents={noAgents}
        noKey={noKey}
        onOpenAgents={onOpenAgents}
        historyProps={{
          sessions,
          currentSessionId,
          historyQuery,
          onHistoryQueryChange: setHistoryQuery,
          onOpenSession: (id) => void openSession(id),
          onRemoveSession: (id) => void removeSession(id),
        }}
        chatProps={{
          selection,
          activeNote,
          activeNoteId,
          contextItems,
          includeNoteContext,
          pickerOpen,
          pickerQuery,
          allNotes,
          tickets,
          onToggleNoteContext: () => setIncludeNoteContext(!includeNoteContext),
          onRemoveContext: removeContext,
          onTogglePicker: () => setPickerOpen((v) => !v),
          onPickerQueryChange: setPickerQuery,
          onAddContext: addContext,
          messages,
          pendingApproval,
          error,
          scrollRef,
          onResolveApproval: resolveApproval,
          composerProps: {
            attachments,
            streaming,
            capturing,
            draft,
            fileInputRef,
            inputRef,
            onAddImageFiles: (files) => void addImageBlobs(files),
            onCaptureNote: () => void captureNote(),
            onPaste: onPasteComposer,
            onSend: () => void onSend(),
            onStop,
            onDraftChange: setDraft,
            onRemoveAttachment: (i) => setAttachments((a) => a.filter((_, j) => j !== i)),
          },
        }}
      />
    </aside>
  );
}
