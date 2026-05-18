import { useEffect, useMemo, useRef, useState } from "react";
import { useTicketsStore } from "../stores/ticketsStore";
import { useVaultStore } from "../stores/vaultStore";
import type { Ticket, TicketStatus, TicketPriority } from "../types/ticket";
import { CalendarDays, CheckSquare } from "lucide-react";
import { BoardToolbar } from "./BoardToolbar";
import { CardQuickActions } from "./CardQuickActions";
import { SubtaskList } from "./SubtaskList";
import { TicketDetail } from "./TicketDetail";
import { ShortcutCheatsheet } from "./ShortcutCheatsheet";
import { subtaskProgress } from "../lib/subtasks";
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
} from "../lib/board-filters";

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

export function TicketsBoard({ focusTicket }: TicketsBoardProps = {}) {
  const tickets = useTicketsStore((s) => s.tickets);
  const upsert = useTicketsStore((s) => s.upsert);
  const setStatus = useTicketsStore((s) => s.setStatus);
  const remove = useTicketsStore((s) => s.remove);
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

  function locate(id: string | null): [number, number] | null {
    if (!id) return null;
    for (let c = 0; c < grid.length; c++) {
      const r = grid[c]!.findIndex((t) => t.id === id);
      if (r >= 0) return [c, r];
    }
    return null;
  }

  function focusAt(col: number, row: number) {
    for (let attempts = 0; attempts < grid.length; attempts++) {
      const list = grid[col];
      if (list && list.length > 0) {
        const r = Math.max(0, Math.min(row, list.length - 1));
        const id = list[r]!.id;
        setFocusedId(id);
        cardRefs.current.get(id)?.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
      col = (col + 1) % grid.length;
    }
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Don't intercept while the user is typing in an input or editing text.
      const active = document.activeElement as HTMLElement | null;
      const isEditing =
        !!active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          active.isContentEditable);
      if (isEditing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Help overlay.
      if (e.key === "?") {
        e.preventDefault();
        setCheatsheetOpen((v) => !v);
        return;
      }
      if (cheatsheetOpen) return;

      // Detail drawer owns its own keys while open.
      if (detailId) return;

      const here = locate(focusedId);

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        if (!here) return focusAt(0, 0);
        focusAt(here[0], here[1] + 1);
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!here) return focusAt(0, 0);
        focusAt(here[0], here[1] - 1);
        return;
      }
      if (e.key === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        if (!here) return focusAt(0, 0);
        focusAt(here[0] + 1 < grid.length ? here[0] + 1 : here[0], here[1]);
        return;
      }
      if (e.key === "h" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (!here) return focusAt(0, 0);
        focusAt(here[0] > 0 ? here[0] - 1 : 0, here[1]);
        return;
      }

      if (!here || !focusedId) return;
      const focusedTicket = grid[here[0]]?.[here[1]];
      if (!focusedTicket) return;

      // Status hotkeys.
      const num = ["1", "2", "3", "4", "5"].indexOf(e.key);
      if (num >= 0 && num < STATUS_ORDER.length) {
        e.preventDefault();
        setStatus(focusedTicket.id, STATUS_ORDER[num]!);
        return;
      }

      if (e.key === "e" || e.key === "Enter") {
        e.preventDefault();
        setDetailId(focusedTicket.id);
        return;
      }

      if (e.key === "a") {
        e.preventDefault();
        const el = cardRefs.current.get(focusedTicket.id);
        const trigger = el?.querySelector<HTMLButtonElement>(".nk-assignee-trigger");
        trigger?.click();
        return;
      }

      if (e.key === ".") {
        e.preventDefault();
        const el = cardRefs.current.get(focusedTicket.id);
        const trigger = el?.querySelector<HTMLButtonElement>(".nk-qa-trigger");
        trigger?.click();
        return;
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [grid, focusedId, detailId, cheatsheetOpen, setStatus]);

  // If the focused ticket disappears (filtered out, deleted), drop focus.
  useEffect(() => {
    if (focusedId && !locate(focusedId)) setFocusedId(null);
  }, [focusedId, grid]);

  if (all.length === 0) {
    return (
      <div className="nk-empty nk-empty--center">
        <p>No tickets yet.</p>
        <p className="nk-empty-hint">
          Click <kbd>+</kbd> in the sidebar to create one.
        </p>
        <button
          className="nk-signin-btn"
          style={{ marginTop: 16, maxWidth: 220 }}
          onClick={() => upsert({ title: "New ticket", status: "todo" })}
        >
          + Create your first ticket
        </button>
      </div>
    );
  }

  function cycleStatus(t: Ticket) {
    const idx = STATUS_ORDER.indexOf(t.status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length] ?? "todo";
    setStatus(t.id, next);
  }

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
      />
      <div className="nk-board">
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
