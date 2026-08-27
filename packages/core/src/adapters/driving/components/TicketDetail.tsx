import { CheckSquare, Plus, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMembersStore } from "../../../composition/members-store";
import {
  appendComment,
  bodyWithoutComments,
  parseComments,
  type TicketComment,
} from "../../../domain/comments";
import type {
  Ticket,
  TicketPriority,
  TicketStatus,
} from "../../../domain/entities/ticket";
import { resolveAssignee } from "../../../domain/members";
import { childProgress, childrenOf } from "../../../domain/ticket-hierarchy";
import { useTicketsStore } from "../stores/ticketsStore";
import { useVaultStore } from "../stores/vaultStore";
import { AssigneePicker } from "./AssigneePicker";

const DONE_STATUSES: ReadonlySet<TicketStatus> = new Set(["done", "archived"]);

interface TicketDetailProps {
  ticketId: string;
  onClose(): void;
  /** Open another ticket in the detail panel (e.g. a subtask or the parent). */
  onOpen?(id: string): void;
}

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "urgent", label: "P0 · Urgent" },
  { value: "high", label: "P1 · High" },
  { value: "medium", label: "P2 · Medium" },
  { value: "low", label: "P3 · Low" },
];

// eslint-disable-next-line max-lines-per-function -- React component rendering all ticket fields with inline editing; splitting would require complex state lifting
export function TicketDetail({ ticketId, onClose, onOpen }: TicketDetailProps) {
  const ticket = useTicketsStore((s) => s.tickets[ticketId]);
  const upsert = useTicketsStore((s) => s.upsert);
  const setStatus = useTicketsStore((s) => s.setStatus);
  const tickets = useTicketsStore((s) => s.tickets);
  const vault = useVaultStore((s) => s.vault);
  const members = useMembersStore((s) => s.members);

  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Don't close while the user is in the middle of writing a comment.
        if (document.activeElement === textareaRef.current && draft.trim()) return;
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, draft]);

  const bodySource = ticket?.body ?? "";
  const description = useMemo(() => bodyWithoutComments(bodySource).trim(), [bodySource]);
  const comments = useMemo(() => parseComments(bodySource), [bodySource]);
  const allTickets = useMemo(() => Object.values(tickets), [tickets]);
  const children = useMemo(() => childrenOf(ticketId, allTickets), [ticketId, allTickets]);
  const progress = useMemo(() => childProgress(ticketId, allTickets), [ticketId, allTickets]);

  if (!ticket) {
    return (
      <div className="nk-detail-backdrop" onClick={onClose}>
        <aside className="nk-detail" onClick={(e) => e.stopPropagation()}>
          <p className="nk-empty-hint">Ticket not found.</p>
        </aside>
      </div>
    );
  }

  const currentAuthor = vault?.owner ? `user:${vault.owner}` : "user:me";
  const creator = resolveAssignee(ticket.createdBy, members);
  const keyDisplay = ticket.key ?? ticket.id.slice(0, 8);

  function sendComment() {
    const text = draft.trim();
    if (!text || !ticket) return;
    const nextBody = appendComment(
      ticket.body,
      currentAuthor,
      new Date().toISOString(),
      text,
    );
    upsert({ ...ticket, body: nextBody });
    setDraft("");
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="nk-detail-backdrop" onClick={onClose}>
      <aside
        className="nk-detail"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Ticket ${ticket.title}`}
      >
        <header className="nk-detail-hd">
          <div
            className="nk-detail-id"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            title="Rename key — a human-friendly slug, unique per vault"
            onBlur={(e) => {
              const next = e.currentTarget.textContent?.trim();
              if (next && next !== keyDisplay) {
                upsert({ ...ticket, key: next });
              } else {
                e.currentTarget.textContent = keyDisplay;
              }
            }}
          >
            {keyDisplay}
          </div>
          <button
            className="nk-iconbtn"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="nk-detail-body">
          <h2
            className="nk-detail-title"
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              const next = e.currentTarget.textContent?.trim();
              if (next && next !== ticket.title) {
                upsert({ ...ticket, title: next });
              }
            }}
          >
            {ticket.title}
          </h2>

          {ticket.parentId && (
            <button
              type="button"
              className="nk-detail-parent"
              onClick={() => onOpen?.(ticket.parentId as string)}
              title="Open parent task"
            >
              Subtask of {parentLabel(tickets[ticket.parentId])}
            </button>
          )}

          <div className="nk-detail-row">
            <span className="nk-detail-label">Status</span>
            <select
              className="nk-input"
              value={ticket.status}
              onChange={(e) =>
                upsert({ ...ticket, status: e.target.value as TicketStatus })
              }
              style={{ width: "auto" }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="nk-detail-row">
            <span className="nk-detail-label">Priority</span>
            <select
              className="nk-input"
              value={ticket.priority}
              onChange={(e) =>
                upsert({ ...ticket, priority: e.target.value as TicketPriority })
              }
              style={{ width: "auto" }}
            >
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="nk-detail-row">
            <span className="nk-detail-label">For</span>
            <AssigneePicker
              value={ticket.assignee}
              onChange={(next) => upsert({ ...ticket, assignee: next })}
              variant="inline"
            />
          </div>

          <div className="nk-detail-row">
            <span className="nk-detail-label">By</span>
            <span className="nk-detail-value">
              {creator?.display ?? "—"}
            </span>
          </div>

          <div className="nk-detail-row">
            <span className="nk-detail-label">Created</span>
            <span className="nk-detail-value">{formatTime(ticket.createdAt)}</span>
          </div>

          <div className="nk-detail-row">
            <span className="nk-detail-label">Due date</span>
            <input
              type="date"
              className="nk-input"
              value={ticket.dueDate ?? ""}
              onChange={(e) =>
                upsert({ ...ticket, dueDate: e.target.value || null })
              }
              style={{ width: "auto" }}
            />
          </div>

          <div className="nk-detail-row">
            <span className="nk-detail-label">Progress</span>
            <div
              className="nk-detail-progress"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              title={
                progress.total > 0
                  ? `${progress.done} of ${progress.total} subtasks done`
                  : "No subtasks"
              }
            >
              <div className="nk-detail-progress-track">
                <div
                  className="nk-detail-progress-fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="nk-detail-progress-text">
                {progress.total > 0
                  ? `${progress.done}/${progress.total} · ${pct}%`
                  : "No subtasks"}
              </span>
            </div>
          </div>

          <section className="nk-detail-section">
            <h3 className="nk-detail-section-title">Description</h3>
            {description ? (
              <pre className="nk-detail-description">{description}</pre>
            ) : (
              <p className="nk-empty-hint">No description.</p>
            )}
          </section>

          <SubtasksSection
            subtasks={children}
            progress={progress}
            onToggle={(child) =>
              setStatus(child.id, DONE_STATUSES.has(child.status) ? "todo" : "done")
            }
            onOpen={onOpen}
            onAdd={(title) => upsert({ title, parentId: ticket.id, status: "todo" })}
          />

          <section className="nk-detail-section">
            <h3 className="nk-detail-section-title">
              Comments ({comments.length})
            </h3>
            <CommentsList comments={comments} members={members} />

            <div className="nk-comment-compose">
              <textarea
                ref={textareaRef}
                placeholder="Write a comment… (⌘+Enter to send)"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    sendComment();
                  }
                }}
                rows={3}
              />
              <div className="nk-comment-actions">
                <span className="nk-comment-author">as {currentAuthor}</span>
                <button
                  className="nk-btn nk-btn--primary"
                  onClick={sendComment}
                  disabled={!draft.trim()}
                >
                  Comment
                </button>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function parentLabel(parent: Ticket | undefined): string {
  return parent?.key ?? parent?.title ?? "another task";
}

interface SubtasksSectionProps {
  subtasks: Ticket[];
  progress: { done: number; total: number };
  onToggle(child: Ticket): void;
  onOpen?(id: string): void;
  onAdd(title: string): void;
}

function SubtasksSection({ subtasks, progress, onToggle, onOpen, onAdd }: SubtasksSectionProps) {
  return (
    <section className="nk-detail-section">
      <h3 className="nk-detail-section-title">
        Subtasks{progress.total > 0 ? ` ${progress.done}/${progress.total}` : ""}
      </h3>
      {subtasks.length > 0 ? (
        <ul className="nk-subtask-children">
          {subtasks.map((child) => {
            const done = DONE_STATUSES.has(child.status);
            return (
              <li key={child.id} className="nk-subtask-child">
                <button
                  type="button"
                  className="nk-subtask-check"
                  onClick={() => onToggle(child)}
                  aria-label={done ? "Mark not done" : "Mark done"}
                >
                  {done ? <CheckSquare size={15} aria-hidden /> : <Square size={15} aria-hidden />}
                </button>
                <button
                  type="button"
                  className={"nk-subtask-open" + (done ? " is-done" : "")}
                  onClick={() => onOpen?.(child.id)}
                >
                  {child.title}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="nk-empty-hint">No subtasks.</p>
      )}
      <AddSubtask onAdd={onAdd} />
    </section>
  );
}

function AddSubtask({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState("");
  function submit() {
    const text = title.trim();
    if (!text) return;
    onAdd(text);
    setTitle("");
  }
  return (
    <div className="nk-subtask-add">
      <input
        className="nk-input"
        placeholder="Add a subtask…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="button"
        className="nk-iconbtn"
        onClick={submit}
        disabled={!title.trim()}
        aria-label="Add subtask"
      >
        <Plus size={16} aria-hidden />
      </button>
    </div>
  );
}

interface CommentsListProps {
  comments: TicketComment[];
  members: ReturnType<typeof useMembersStore.getState>["members"];
}

function CommentsList({ comments, members }: CommentsListProps) {
  if (comments.length === 0) {
    return <p className="nk-empty-hint">No comments yet.</p>;
  }
  return (
    <ol className="nk-comments">
      {comments.map((c, i) => {
        const resolved = resolveAssignee(c.author, members);
        const display = resolved?.display ?? c.author;
        const isAgent = resolved?.kind === "agent";
        return (
          <li key={i} className={"nk-comment" + (isAgent ? " is-agent" : "")}>
            <header>
              <span className="nk-comment-name">{display}</span>
              <time className="nk-comment-time">{formatTime(c.timestamp)}</time>
            </header>
            <div className="nk-comment-body">{c.body}</div>
          </li>
        );
      })}
    </ol>
  );
}

function formatTime(raw: string | null): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString();
}

// Re-export the ticket type so callers can compose without an extra import.
export type { Ticket };
