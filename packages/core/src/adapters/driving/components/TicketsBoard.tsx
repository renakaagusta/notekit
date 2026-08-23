import { CalendarDays, CheckSquare, Lock } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Ticket, TicketStatus, TicketPriority } from "../../../domain/entities/ticket";
import { subtaskProgress } from "../../../domain/subtasks";
import {
  BUILTIN_VIEWS,
  EMPTY_FILTERS,
  type BoardFilters,
  type SavedView,
  loadActiveView,
  loadFilters,
  loadSavedViews,
  matchDueRange,
  matchTicket,
  saveActiveView,
  saveFilters,
  saveSavedViews,
  viewDueRange,
} from "../../../lib/board-filters";
import { useE2eeOnboardingStore } from "../../../lib/e2ee-onboarding";
import { useCryptoStore } from "../stores/cryptoStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { useVaultStore } from "../stores/vaultStore";
import { BoardToolbar } from "./BoardToolbar";
import { CardQuickActions } from "./CardQuickActions";
import { ShortcutCheatsheet } from "./ShortcutCheatsheet";
import { SubtaskList } from "./SubtaskList";
import { TicketDetail } from "./TicketDetail";

// Shared with CalendarView so a card dragged on the board can also be dropped
// onto a calendar cell to set its due date.
const DRAG_MIME = "application/x-notekit-ticket-id";

/**
 * Focus signal. Wrapping the id in a `{id, seq}` object lets a re-selection
 * of the same ticket re-fire the effect, since identity changes even when
 * `id` stays the same.
 */
export interface FocusPulse {
  id: string;
  seq: number;
}

interface TicketsBoardProps {
  /** Scroll this ticket into view and flash-highlight it (e.g. from search). */
  focusTicket?: FocusPulse | null;
  /** Extra content rendered on the far-right of the board toolbar. */
  endSlot?: React.ReactNode;
}

const COLUMNS: { status: TicketStatus; label: string; dot: string }[] = [
  { status: "todo", label: "Todo", dot: "status-todo" },
  { status: "in_progress", label: "In Progress", dot: "status-progress" },
  { status: "blocked", label: "Blocked", dot: "status-blocked" },
  { status: "done", label: "Done", dot: "status-done" },
  { status: "archived", label: "Archived", dot: "status-canceled" },
];

const STATUS_ORDER: TicketStatus[] = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "archived",
];

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  urgent: "P0",
  high: "P1",
  medium: "P2",
  low: "P3",
};

const PRIORITY_CLASS: Record<TicketPriority, string> = {
  urgent: "priority-p0",
  high: "priority-p1",
  medium: "priority-p2",
  low: "priority-p3",
};

function isEditingElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

function handleVertKey(
  key: string,
  here: [number, number] | null,
  focusAt: (col: number, row: number) => void,
  e: KeyboardEvent,
): boolean {
  if (key === "j" || key === "ArrowDown") {
    e.preventDefault();
    if (!here) { focusAt(0, 0); return true; }
    focusAt(here[0], here[1] + 1);
    return true;
  }
  if (key === "k" || key === "ArrowUp") {
    e.preventDefault();
    if (!here) { focusAt(0, 0); return true; }
    focusAt(here[0], here[1] - 1);
    return true;
  }
  return false;
}

function handleHorizKey(
  key: string,
  here: [number, number] | null,
  grid: Ticket[][],
  focusAt: (col: number, row: number) => void,
  e: KeyboardEvent,
): boolean {
  if (key === "l" || key === "ArrowRight") {
    e.preventDefault();
    if (!here) { focusAt(0, 0); return true; }
    focusAt(here[0] + 1 < grid.length ? here[0] + 1 : here[0], here[1]);
    return true;
  }
  if (key === "h" || key === "ArrowLeft") {
    e.preventDefault();
    if (!here) { focusAt(0, 0); return true; }
    focusAt(here[0] > 0 ? here[0] - 1 : 0, here[1]);
    return true;
  }
  return false;
}

function handleNavKey(
  key: string,
  here: [number, number] | null,
  grid: Ticket[][],
  focusAt: (col: number, row: number) => void,
  e: KeyboardEvent,
): boolean {
  return handleVertKey(key, here, focusAt, e) || handleHorizKey(key, here, grid, focusAt, e);
}

interface ActionKeyContext {
  focusedTicket: Ticket;
  cardRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  setDetailId: (id: string) => void;
  setStatus: (id: string, status: TicketStatus) => void;
}

function handleActionKey(key: string, ctx: ActionKeyContext, e: KeyboardEvent): boolean {
  const { focusedTicket, cardRefs, setDetailId, setStatus } = ctx;
  const num = ["1", "2", "3", "4", "5"].indexOf(key);
  if (num >= 0 && num < STATUS_ORDER.length) {
    e.preventDefault();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- num is bounded by STATUS_ORDER.length check above
    setStatus(focusedTicket.id, STATUS_ORDER[num]!);
    return true;
  }
  if (key === "e" || key === "Enter") {
    e.preventDefault();
    setDetailId(focusedTicket.id);
    return true;
  }
  if (key === "a") {
    e.preventDefault();
    cardRefs.current.get(focusedTicket.id)?.querySelector<HTMLButtonElement>(".nk-assignee-trigger")?.click();
    return true;
  }
  if (key === ".") {
    e.preventDefault();
    cardRefs.current.get(focusedTicket.id)?.querySelector<HTMLButtonElement>(".nk-qa-trigger")?.click();
    return true;
  }
  return false;
}

// eslint-disable-next-line max-lines-per-function -- TicketsBoard is a large board component combining state, keyboard handling, drag-drop, and column rendering
export function TicketsBoard({ focusTicket, endSlot }: TicketsBoardProps = {}) {
  const tickets = useTicketsStore((s) => s.tickets);
  const upsert = useTicketsStore((s) => s.upsert);
  const setStatus = useTicketsStore((s) => s.setStatus);
  const remove = useTicketsStore((s) => s.remove);
  const toggleEncrypted = useTicketsStore((s) => s.toggleEncrypted);
  // Lock chip is redundant when the whole vault is born-E2EE.
  const encryptionRequired = useCryptoStore((s) => s.encryptionRequired);
  const vaultId = useVaultStore((s) => s.activeId);
  const requestEncrypt = useE2eeOnboardingStore((s) => s.requestEncrypt);

  function handleToggleTicketEncrypted(t: Ticket): void {
    // Decrypts skip the gate; first encrypt per vault routes through the
    // onboarding modal so the user reads what Git history can't take back.
    if (t.encrypted) {
      toggleEncrypted(t.id);
      return;
    }
    if (!vaultId) return;
    requestEncrypt({
      vaultId,
      kind: "ticket",
      title: t.title,
      onConfirm: () => toggleEncrypted(t.id),
    });
  }
  const vault = useVaultStore((s) => s.vault);

  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [dragOver, setDragOver] = useState<TicketStatus | null>(null);

  const [filters, setFilters] = useState<BoardFilters>(() => loadFilters());
  const [activeViewId, setActiveViewId] = useState<string>(() => loadActiveView());
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useEffect(() => saveFilters(filters), [filters]);
  useEffect(() => saveActiveView(activeViewId), [activeViewId]);
  useEffect(() => saveSavedViews(savedViews), [savedViews]);

  useEffect(() => {
    if (!focusTicket) return;
    const el = cardRefs.current.get(focusTicket.id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("is-focus-flash");
    const t = setTimeout(() => el.classList.remove("is-focus-flash"), 1400);
    return () => clearTimeout(t);
  }, [focusTicket]);

  const all = Object.values(tickets);

  const currentUser = vault?.owner ? `user:${vault.owner}` : null;

  const dueRange = useMemo(() => viewDueRange(activeViewId), [activeViewId]);

  const visible = useMemo(() => {
    return all.filter(
      (t) => matchTicket(t, filters) && matchDueRange(t, dueRange),
    );
  }, [all, filters, dueRange]);

  function applyView(id: string) {
    setActiveViewId(id);
    const builtin = BUILTIN_VIEWS.find((v) => v.id === id);
    if (builtin) {
      setFilters(builtin.resolve({ currentUser, tickets: all }));
      return;
    }
    const saved = savedViews.find((v) => v.id === id);
    if (saved) {
      setFilters(saved.filters);
      return;
    }
    setFilters(EMPTY_FILTERS);
  }

  function onFiltersChange(next: BoardFilters) {
    setFilters(next);
    // Manual edits move us out of any named view back to ad-hoc.
    if (activeViewId !== "all") setActiveViewId("all");
  }

  function saveCurrent(name: string) {
    const id = `saved:${Date.now().toString(36)}`;
    const view: SavedView = { id, name, filters };
    setSavedViews((prev) => [...prev, view]);
    setActiveViewId(id);
  }

  function deleteSavedView(id: string) {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === id) setActiveViewId("all");
  }

  const views = useMemo(
    () => [
      ...BUILTIN_VIEWS.map((v) => ({ id: v.id, name: v.name, builtin: true })),
      ...savedViews.map((v) => ({ id: v.id, name: v.name, builtin: false })),
    ],
    [savedViews],
  );

  // Pre-compute the navigable grid so the keyboard handler can move focus by
  // column/row without re-walking the ticket list on every keystroke.
  const grid = useMemo(() => {
    return COLUMNS.map((col) => visible.filter((t) => t.status === col.status));
  }, [visible]);

  const locate = React.useCallback(
    (id: string | null): [number, number] | null => {
      if (!id) return null;
      for (const [c, col] of grid.entries()) {
        const r = col.findIndex((t) => t.id === id);
        if (r >= 0) return [c, r];
      }
      return null;
    },
    [grid],
  );

  const focusAt = React.useCallback(
    (col: number, row: number) => {
      let c = col;
      // eslint-disable-next-line @typescript-eslint/prefer-for-of -- index variable `attempts` is needed to limit wrapping; `c` is mutated each iteration
      for (let attempts = 0; attempts < grid.length; attempts++) {
        const list = grid[c];
        if (list && list.length > 0) {
          const r = Math.max(0, Math.min(row, list.length - 1));
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- r is clamped to [0, list.length-1] so list[r] is always defined
          const id = list[r]!.id;
          setFocusedId(id);
          cardRefs.current.get(id)?.scrollIntoView({ block: "nearest", inline: "nearest" });
          return;
        }
        c = (c + 1) % grid.length;
      }
    },
    [grid],
  );

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isEditingElement(document.activeElement as HTMLElement | null)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?") {
        e.preventDefault();
        setCheatsheetOpen((v) => !v);
        return;
      }
      if (cheatsheetOpen) return;
      if (detailId) return;

      const here = locate(focusedId);

      if (handleNavKey(e.key, here, grid, focusAt, e)) return;

      if (!here || !focusedId) return;
      const focusedTicket = grid[here[0]]?.[here[1]];
      if (!focusedTicket) return;

      handleActionKey(e.key, { focusedTicket, cardRefs, setDetailId, setStatus }, e);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [grid, focusedId, detailId, cheatsheetOpen, setStatus, focusAt, locate]);

  // If the focused ticket disappears (filtered out, deleted), drop focus.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronous focus-drop when the focused ticket is removed from the visible set
    if (focusedId && !locate(focusedId)) setFocusedId(null);
  }, [focusedId, grid, locate]);


  function onCardDragStart(t: Ticket, e: React.DragEvent) {
    // Don't initiate a drag when the user is editing/interacting with anything
    // that owns its own click + text behavior: title, subtasks, popovers.
    const target = e.target as HTMLElement | null;
    if (
      target?.closest(".title, .nk-subtasks, .nk-qa, .nk-assignee, input, textarea, button")
    ) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(DRAG_MIME, t.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function onColumnDrop(status: TicketStatus, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData(DRAG_MIME);
    if (!id) return;
    const ticket = tickets[id];
    if (!ticket || ticket.status === status) return;
    setStatus(id, status);
  }

  return (
    <div className="nk-board-wrap">
      <BoardToolbar
        filters={filters}
        onFiltersChange={onFiltersChange}
        tickets={all}
        activeViewId={activeViewId}
        onActiveViewChange={applyView}
        views={views}
        savedViews={savedViews}
        onSaveCurrent={saveCurrent}
        onDeleteSavedView={deleteSavedView}
        endSlot={endSlot}
      />
      <div className="nk-board">
        {/* eslint-disable-next-line max-lines-per-function -- column render includes drag-drop handlers, card list, and empty-state button */}
        {COLUMNS.map((col, colIndex) => {
          const cards = grid[colIndex] ?? [];
          const isOver = dragOver === col.status;
        return (
          <section key={col.status} className="nk-col">
            <header className="nk-col-hd">
              <span>
                <span className={`status-dot ${col.dot}`} aria-hidden />
                {col.label}
              </span>
              <span className="count">{cards.length}</span>
            </header>
            <div
              className={"nk-col-body" + (isOver ? " drop-target" : "")}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOver !== col.status) setDragOver(col.status);
              }}
              onDragLeave={(e) => {
                // Only clear when leaving the column body itself, not its children.
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                if (dragOver === col.status) setDragOver(null);
              }}
              onDrop={(e) => onColumnDrop(col.status, e)}
            >
              {/* eslint-disable-next-line max-lines-per-function -- card render includes encrypted badge, subtask progress, labels, and quick-action toolbar */}
              {cards.map((t) => {
                const progress = subtaskProgress(t.body);
                const isFocused = focusedId === t.id;
                return (
                <article
                  key={t.id}
                  className={"nk-card" + (isFocused ? " is-kbd-focus" : "")}
                  ref={(el) => {
                    if (el) cardRefs.current.set(t.id, el);
                    else cardRefs.current.delete(t.id);
                  }}
                  draggable
                  onDragStart={(e) => onCardDragStart(t, e)}
                  onMouseDown={() => setFocusedId(t.id)}
                  onDoubleClick={(e) => {
                    if ((e.target as HTMLElement).closest(".nk-subtasks, button, input, textarea")) return;
                    setDetailId(t.id);
                  }}
                >
                  <div className="meta">
                    <button
                      type="button"
                      className="id"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailId(t.id);
                      }}
                      title="Open ticket"
                    >
                      {t.id.slice(0, 6)}
                    </button>
                    <span className={`nk-chip ${PRIORITY_CLASS[t.priority]}`}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                    {t.encrypted && !encryptionRequired && (
                      <span
                        className="nk-chip nk-card-encrypted"
                        title="End-to-end encrypted — body and title are only readable on your devices"
                        aria-label="Encrypted"
                      >
                        <Lock size={11} strokeWidth={2} aria-hidden />
                      </span>
                    )}
                    {progress.total > 0 && (
                      <span
                        className={
                          "nk-chip nk-subtask-progress" +
                          (progress.done === progress.total ? " is-complete" : "")
                        }
                        title={`${progress.done} of ${progress.total} subtasks done`}
                      >
                        <CheckSquare size={11} strokeWidth={2} aria-hidden />
                        {progress.done}/{progress.total}
                      </span>
                    )}
                    {t.dueDate && (
                      <span className="nk-chip nk-card-due" title={`Due ${t.dueDate}`}>
                        <CalendarDays size={11} strokeWidth={2} aria-hidden />
                        {t.dueDate.slice(5)}
                      </span>
                    )}
                    <span className="nk-card-spacer" />
                    <CardQuickActions
                      ticket={t}
                      onPriority={(p) => upsert({ ...t, priority: p })}
                      onDueDate={(d) => upsert({ ...t, dueDate: d })}
                      onDelete={() => remove(t.id)}
                      onToggleEncrypted={() => handleToggleTicketEncrypted(t)}
                    />
                  </div>
                  <button
                    type="button"
                    className="title"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDetailId(t.id);
                    }}
                    title="Open ticket"
                  >
                    {t.title}
                  </button>
                  <SubtaskList
                    body={t.body}
                    onChange={(nextBody) => upsert({ ...t, body: nextBody })}
                  />
                  {t.labels.length > 0 && (
                    <div className="nk-card-foot">
                      <span className="labels">
                        {t.labels.map((l) => (
                          <span key={l} className="nk-chip">
                            {l}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </article>
                );
              })}
              {cards.length === 0 && (
                <button
                  className="nk-col-add"
                  onClick={() =>
                    upsert({ title: "New ticket", status: col.status })
                  }
                  title={`New ticket in ${col.label}`}
                >
                  + Add
                </button>
              )}
            </div>
          </section>
        );
        })}
      </div>

      {detailId && (
        <TicketDetail
          ticketId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
      {cheatsheetOpen && (
        <ShortcutCheatsheet onClose={() => setCheatsheetOpen(false)} />
      )}
    </div>
  );
}
