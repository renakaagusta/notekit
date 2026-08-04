import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Check, FileText, Loader2, Lock, Send, Sparkles, TextSelect, Wrench, X } from "lucide-react";
import { useAIChatStore, messageText } from "../stores/aiChatStore";
import { useCryptoStore } from "../stores/cryptoStore";
import { useNotesStore } from "../stores/notesStore";
import { useVaultStore } from "../stores/vaultStore";
import { noteTitle } from "../lib/note-display";
import {
  listAgents,
  agentKeySecretName,
  DEFAULT_AGENT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  type AgentProfile,
} from "../lib/agents-api";
import { listSecretNames } from "../lib/secrets-vault";
import { streamAssistant, type AssistantMessage } from "../lib/ai-agent";
import { buildAssistantTools, describeToolCall } from "../lib/ai-tools";
import { renderAssistantHtml } from "../lib/chat-markdown";

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
  const pendingApproval = useAIChatStore((s) => s.pendingApproval);

  const device = useCryptoStore((s) => s.device);
  const cryptoPhase = useCryptoStore((s) => s.phase);

  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const notes = useNotesStore((s) => s.notes);
  const activeNote = activeNoteId ? notes[activeNoteId] ?? null : null;
  const defaultFolder = useVaultStore((s) => s.activeSettings?.defaultFolder ?? null);

  const [agents, setAgents] = useState<AgentProfile[] | null>(null);
  const [keyStoredSlugs, setKeyStoredSlugs] = useState<Set<string> | null>(null);
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  // Queue of approvals — the model may fire several mutating tools (even in
  // parallel), and each needs its own confirmation. A single slot would let
  // later requests clobber earlier ones and deadlock the stream.
  const approvalQueue = useRef<
    Array<{ id: string; toolName: string; summary: string; input: unknown; resolve: (ok: boolean) => void }>
  >([]);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cryptoPhase, refreshTick]);

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

  if (!open) return null;

  const selectedAgent =
    agents?.find((a) => a.slug === selectedAgentSlug) ?? agents?.[0] ?? null;

  async function onSend() {
    const text = draft.trim();
    if (!text || streaming || !device || !selectedAgent) return;

    const store = useAIChatStore.getState();
    const prior: AssistantMessage[] = store.messages.map((m) => ({
      role: m.role,
      content: messageText(m),
    }));

    // Build the scoped context block: selection wins over whole-note.
    let contextBlock = "";
    if (selection) {
      contextBlock = `[Konteks — teks terpilih pengguna]\n${selection}\n\n`;
    } else if (includeNoteContext && activeNote) {
      contextBlock =
        `[Konteks — catatan aktif "${noteTitle(activeNote)}"]\n${activeNote.body}\n\n`;
    }

    setDraft("");
    store.pushUser(text);
    const assistantId = store.startAssistant();
    store.setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const permissions = selectedAgent.toolPermissions ?? "read-only";
    const tools = buildAssistantTools({ requestApproval, defaultFolder }, permissions);

    let system = selectedAgent.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
    system +=
      "\n\nKamu punya tools untuk: catatan (list_notes, search_notes, read_note), folder (list_folders), link (list_links), task/tiket (list_tasks), nama secret (list_secrets — TANPA nilai), riwayat commit git (recent_activity), serta membuka/menutup tab" +
      (permissions === "read-write"
        ? ". Kamu juga bisa membuat/mengubah/menghapus catatan, menyimpan link, membuat task & ubah statusnya — setiap perubahan minta persetujuan pengguna dulu."
        : ".") +
      " Saat ditanya isi vault secara menyeluruh, gunakan list_notes (bukan search_notes). Kamu TIDAK PERNAH bisa membaca NILAI secret, hanya namanya. Gunakan tools bila relevan.";

    try {
      await streamAssistant({
        device,
        keySecretName: agentKeySecretName(selectedAgent.slug),
        provider: selectedAgent.provider ?? "anthropic",
        baseUrl: selectedAgent.baseUrl,
        model: selectedAgent.model ?? DEFAULT_AGENT_MODEL,
        system,
        messages: [...prior, { role: "user", content: contextBlock + text }],
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
      ) : (
        <>
          {/* Context chips — selection wins, else the whole active note. */}
          <div className="nk-ai-chips">
            {selection ? (
              <span className="nk-ai-chip is-selection">
                <TextSelect size={12} aria-hidden />
                Teks terpilih ({wordCount(selection)} kata)
              </span>
            ) : activeNote ? (
              <button
                className={`nk-ai-chip${includeNoteContext ? " is-on" : ""}`}
                onClick={() => setIncludeNoteContext(!includeNoteContext)}
                title={
                  includeNoteContext
                    ? "Catatan aktif dipakai sebagai konteks — klik untuk matikan"
                    : "Klik untuk pakai catatan aktif sebagai konteks"
                }
              >
                <FileText size={12} aria-hidden />
                {noteTitle(activeNote)}
                {includeNoteContext && <X size={11} aria-hidden />}
              </button>
            ) : (
              <span className="nk-ai-chip is-empty">Tanpa konteks catatan</span>
            )}
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
                    {m.parts.map((p, i) =>
                      p.kind === "tool" ? (
                        <div key={i} className="nk-ai-toolnote">
                          <Wrench size={11} aria-hidden /> {p.label}
                        </div>
                      ) : m.role === "assistant" ? (
                        <div key={i} className="nk-ai-msg nk-ai-msg--assistant nk-ai-prose">
                          <div
                            dangerouslySetInnerHTML={{
                              __html: renderAssistantHtml(p.text),
                            }}
                          />
                        </div>
                      ) : (
                        <div key={i} className="nk-ai-msg nk-ai-msg--user">
                          {p.text}
                        </div>
                      ),
                    )}
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

          <div className="nk-ai-composer">
            <textarea
              className="nk-ai-input"
              placeholder="Tanya asisten…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
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
                disabled={!draft.trim()}
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
