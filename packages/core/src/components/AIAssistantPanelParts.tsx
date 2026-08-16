import {
  Check,
  FileText,
  History,
  ListChecks,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { DEFAULT_SYSTEM_PROMPT } from "../lib/agents-api";
import type { AgentProfile } from "../lib/agents-api";
import { renderAssistantHtml } from "../lib/chat-markdown";
import { noteTitle } from "../lib/note-display";
import type { ChatMessage, ChatSessionMeta, ContextItem, PendingApproval } from "../stores/aiChatStore";
import type { Note } from "../types/note";
import type { Ticket } from "../types/ticket";

/** Compact relative time for the history list ("2m", "3h", "5d"). */
export function relTime(iso: string): string {
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

export function wordCount(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

interface HistoryPageViewProps {
  sessions: ChatSessionMeta[];
  currentSessionId: string | null;
  historyQuery: string;
  onHistoryQueryChange: (q: string) => void;
  onOpenSession: (id: string) => void;
  onRemoveSession: (id: string) => void;
}

export function HistoryPageView({
  sessions,
  currentSessionId,
  historyQuery,
  onHistoryQueryChange,
  onOpenSession,
  onRemoveSession,
}: HistoryPageViewProps) {
  const q = historyQuery.trim().toLowerCase();
  const hits = q ? sessions.filter((s) => (s.title || "").toLowerCase().includes(q)) : sessions;

  return (
    <div className="nk-ai-history-page">
      <div className="nk-ai-history-search">
        <Search size={14} aria-hidden />
        <input
          className="nk-ai-history-search-input"
          placeholder="Cari riwayat obrolan…"
          value={historyQuery}
          onChange={(e) => onHistoryQueryChange(e.target.value)}
          autoFocus
        />
        {historyQuery && (
          <button
            className="nk-ai-history-search-clear"
            onClick={() => onHistoryQueryChange("")}
            aria-label="Bersihkan pencarian"
          >
            <X size={13} aria-hidden />
          </button>
        )}
      </div>
      <div className="nk-ai-history-list">
        {sessions.length === 0 ? (
          <div className="nk-ai-history-empty">
            <History size={26} aria-hidden />
            <p>Belum ada riwayat obrolan.</p>
          </div>
        ) : hits.length === 0 ? (
          <div className="nk-ai-history-empty"><p>Tak ada yang cocok.</p></div>
        ) : hits.map((s) => (
          <div
            key={s.id}
            className={`nk-ai-history-row${s.id === currentSessionId ? " is-active" : ""}`}
          >
            <button
              className="nk-ai-history-open"
              onClick={() => onOpenSession(s.id)}
              title={s.title}
            >
              <History size={13} aria-hidden />
              <span className="nk-ai-history-title">{s.title}</span>
              <span className="nk-ai-history-time">{relTime(s.updatedAt)}</span>
            </button>
            <button
              className="nk-ai-history-del"
              onClick={() => onRemoveSession(s.id)}
              aria-label="Hapus obrolan"
              title="Hapus"
            >
              <Trash2 size={13} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ContextPickerDropdownProps {
  pickerQuery: string;
  allNotes: Note[];
  tickets: Ticket[];
  contextItems: ContextItem[];
  onPickerQueryChange: (q: string) => void;
  onAddContext: (item: ContextItem) => void;
}

export function ContextPickerDropdown({
  pickerQuery,
  allNotes,
  tickets,
  contextItems,
  onPickerQueryChange,
  onAddContext,
}: ContextPickerDropdownProps) {
  const q = pickerQuery.toLowerCase();
  const pinned = new Set(contextItems.map((c) => c.id));
  const noteHits = allNotes
    .filter((n) => !pinned.has(n.id) && noteTitle(n).toLowerCase().includes(q))
    .slice(0, 8);
  const taskHits = tickets
    .filter((t) => !pinned.has(t.id) && t.title.toLowerCase().includes(q))
    .slice(0, 6);

  return (
    <div className="nk-ai-ctx-picker">
      <input
        className="nk-ai-ctx-search"
        placeholder="Search notes & tasks…"
        value={pickerQuery}
        onChange={(e) => onPickerQueryChange(e.target.value)}
        autoFocus
      />
      <div className="nk-ai-ctx-list">
        {!noteHits.length && !taskHits.length ? (
          <div className="nk-ai-ctx-empty">No matches</div>
        ) : (
          <>
            {noteHits.map((n) => (
              <button
                key={n.id}
                className="nk-ai-ctx-item"
                onClick={() => {
                  onAddContext({ kind: "note", id: n.id, title: noteTitle(n) });
                  onPickerQueryChange("");
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
                  onAddContext({ kind: "task", id: t.id, title: t.title });
                  onPickerQueryChange("");
                }}
              >
                <ListChecks size={12} aria-hidden /> {t.title}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

interface ContextChipsBarProps {
  selection: string;
  activeNote: Note | null;
  activeNoteId: string | null;
  contextItems: ContextItem[];
  includeNoteContext: boolean;
  pickerOpen: boolean;
  pickerQuery: string;
  allNotes: Note[];
  tickets: Ticket[];
  onToggleNoteContext: () => void;
  onRemoveContext: (id: string) => void;
  onTogglePicker: () => void;
  onPickerQueryChange: (q: string) => void;
  onAddContext: (item: ContextItem) => void;
}

export function ContextChipsBar({
  selection,
  activeNote,
  activeNoteId,
  contextItems,
  includeNoteContext,
  pickerOpen,
  pickerQuery,
  allNotes,
  tickets,
  onToggleNoteContext,
  onRemoveContext,
  onTogglePicker,
  onPickerQueryChange,
  onAddContext,
}: ContextChipsBarProps) {
  return (
    <div className="nk-ai-chips">
      {selection && (
        <span className="nk-ai-chip is-selection">
          <FileText size={12} aria-hidden />
          {wordCount(selection)} words
        </span>
      )}
      {activeNote && !contextItems.some((c) => c.id === activeNoteId) && (
        <button
          className={`nk-ai-chip${includeNoteContext ? " is-on" : ""}`}
          onClick={onToggleNoteContext}
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
            onClick={() => onRemoveContext(c.id)}
            aria-label="Remove context"
          >
            <X size={11} aria-hidden />
          </button>
        </span>
      ))}
      <div className="nk-ai-ctx-add">
        <button
          className="nk-ai-chip nk-ai-chip--add"
          onClick={onTogglePicker}
          title="Add a note or task as context"
          aria-label="Add context"
        >
          <Plus size={13} aria-hidden />
        </button>
        {pickerOpen && (
          <ContextPickerDropdown
            pickerQuery={pickerQuery}
            allNotes={allNotes}
            tickets={tickets}
            contextItems={contextItems}
            onPickerQueryChange={onPickerQueryChange}
            onAddContext={onAddContext}
          />
        )}
      </div>
    </div>
  );
}

interface ChatTurnProps {
  m: ChatMessage;
}

function ChatTurn({ m }: ChatTurnProps) {
  const last = m.parts[m.parts.length - 1];
  const showCaret = m.pending && (!last || last.kind === "tool");
  return (
    <div className="nk-ai-turn">
      {m.parts.map((p, i) => {
        if (p.kind === "tool") {
          return (
            <div key={i} className="nk-ai-toolnote">
              <Wrench size={11} aria-hidden /> {p.label}
            </div>
          );
        }
        if (p.kind === "image") {
          return (
            <img
              key={i}
              className="nk-ai-msg-img"
              src={p.url}
              alt="Lampiran gambar"
              loading="lazy"
            />
          );
        }
        if (m.role === "assistant") {
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
}

interface ChatBodyViewProps {
  messages: ChatMessage[];
  pendingApproval: PendingApproval | null;
  error: string | null;
  scrollRef: React.RefObject<HTMLDivElement>;
  onResolveApproval: (ok: boolean) => void;
}

export function ChatBodyView({
  messages,
  pendingApproval,
  error,
  scrollRef,
  onResolveApproval,
}: ChatBodyViewProps) {
  return (
    <div className="nk-ai-body" ref={scrollRef}>
      {messages.length === 0 ? (
        <div className="nk-ai-empty">
          <Sparkles size={22} aria-hidden />
          <p>Tanya apa saja tentang catatanmu.</p>
        </div>
      ) : (
        messages.map((m) => <ChatTurn key={m.id} m={m} />)
      )}
      {pendingApproval && (
        <div className="nk-ai-approval">
          <div className="nk-ai-approval-hd">
            <Wrench size={13} aria-hidden /> Perlu persetujuan
          </div>
          <div className="nk-ai-approval-summary">{pendingApproval.summary}</div>
          <div className="nk-ai-approval-actions">
            <button className="nk-btn nk-btn--primary" onClick={() => onResolveApproval(true)}>
              <Check size={14} aria-hidden /> Setujui
            </button>
            <button className="nk-btn" onClick={() => onResolveApproval(false)}>
              <X size={14} aria-hidden /> Tolak
            </button>
          </div>
        </div>
      )}
      {error && <div className="nk-ai-error">{error}</div>}
    </div>
  );
}

interface BuildContextBlockOptions {
  selection: string;
  includeNoteContext: boolean;
  activeNote: Note | null;
  contextItems: ContextItem[];
  getNoteById: (id: string) => Note | undefined;
  getTicketById: (id: string) => { id: string; title: string; body: string; status: string } | undefined;
}

export function buildContextBlock({
  selection,
  includeNoteContext,
  activeNote,
  contextItems,
  getNoteById,
  getTicketById,
}: BuildContextBlockOptions): string {
  let block = "";
  if (selection) {
    block += `[Context — selected text]\n${selection}\n\n`;
  }
  if (includeNoteContext && activeNote) {
    block += `[Context — active note "${noteTitle(activeNote)}"]\n${activeNote.body}\n\n`;
  }
  for (const item of contextItems) {
    if (item.kind === "note") {
      const n = getNoteById(item.id);
      if (n) block += `[Context — note "${noteTitle(n)}"]\n${n.body}\n\n`;
    } else {
      const tk = getTicketById(item.id);
      if (tk) {
        block += `[Context — task "${tk.title}" (status: ${tk.status})]\n${tk.body}\n\n`;
      }
    }
  }
  return block;
}

export function buildSystemPrompt(agent: AgentProfile, permissions: string): string {
  let system = agent.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  system +=
    "\n\nYou have tools for: notes (list_notes, search_notes, read_note), folders (list_folders), links (list_links), tasks (list_tasks), secret names (list_secrets — NAMES only, never values), git commit history (recent_activity), and opening/closing tabs" +
    (permissions === "read-write"
      ? ". You can also create/edit/delete notes, save links, create tasks & change their status — every change requires the user's approval first."
      : ".") +
    " When asked about the whole vault, use list_notes (not search_notes). You can NEVER read secret VALUES, only their names. Use tools when relevant." +
    "\n\nCRITICAL: You may ONLY claim a note/link/task was created, updated, or deleted if you ACTUALLY called the matching tool (create_note / update_note / delete_note / create_link / create_task / set_task_status) in THIS reply and it returned success. Never say \"done\", \"sudah\", \"✅\", or describe a change you did not perform via a tool call. To change a note's content you MUST call update_note with the note's id and the COMPLETE new body — describing the change in text does nothing. If a task needs a tool, call the tool first, then confirm based on its result." +
    "\n\nAlways reply in the same language the user writes in.";
  return system;
}
