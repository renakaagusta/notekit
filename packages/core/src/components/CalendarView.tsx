import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { nanoid } from "nanoid";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import type { Ticket, TicketPriority } from "../types/ticket";
import type { Note } from "../types/note";
import { TicketDetail } from "./TicketDetail";
import {
  buildMonthGrid,
  buildWeekGrid,
  dayNotePathFor,
  type GridCell,
  journalYMDFromPath,
  localeFirstWeekday,
  monthLabel,
  parseYMD,
  shiftYMD,
  todayYMD,
  weekdayLabels,
} from "../lib/journal";
import { Heatmap } from "./Heatmap";
import { SkeletonCommitList } from "./Skeleton";
import { listCommits, type VaultCommit } from "../lib/vault-api";

type Mode = "month" | "week" | "day";

const MAX_CHIPS_PER_CELL = 3;

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

const DRAG_MIME = "application/x-notekit-ticket-id";

type FocusPulse = { id: string; seq: number };

interface CalendarViewProps {
  onOpenJournal?: (ymd: string) => void;
  onOpenTicket?: (ticketId: string) => void;
  focusTicket?: FocusPulse | null;
}

export function CalendarView({ onOpenJournal, onOpenTicket, focusTicket }: CalendarViewProps) {
  const notes = useNotesStore((s) => s.all());
  const tickets = useTicketsStore((s) => s.all());
  const setDueDate = useTicketsStore((s) => s.setDueDate);
  const upsertTicket = useTicketsStore((s) => s.upsert);
  const [detailId, setDetailId] = useState<string | null>(null);

  const today = todayYMD();
  const [cursor, setCursor] = useState(today);
  const [mode, setMode] = useState<Mode>("month");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [popupInitialNoteId, setPopupInitialNoteId] = useState<string | null>(null);
  const [heatmapOpen, setHeatmapOpen] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("notekit:heatmapOpen") === "1";
  });
  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem("notekit:heatmapOpen", heatmapOpen ? "1" : "0");
  }, [heatmapOpen]);
  const [heatmapSelectedYmd, setHeatmapSelectedYmd] = useState<string | null>(null);

  useEffect(() => {
    if (focusTicket?.id) setDetailId(focusTicket.id);
  }, [focusTicket?.id, focusTicket?.seq]);

  function handleOpenTicket(id: string) {
    setDetailId(id);
    onOpenTicket?.(id);
  }

  const firstWeekday = useMemo(() => localeFirstWeekday(), []);
  const labels = useMemo(() => weekdayLabels(firstWeekday), [firstWeekday]);

  const cursorDate = parseYMD(cursor) ?? new Date();
  const viewYear = cursorDate.getFullYear();
  const viewMonth = cursorDate.getMonth();

  // Group all calendar notes (journal path) by day.
  const { notesByDay, ticketsByDay } = useMemo(() => {
    const notesByDay = new Map<string, Note[]>();
    for (const n of notes) {
      const ymd = journalYMDFromPath(n.path);
      if (!ymd) continue;
      const list = notesByDay.get(ymd) ?? [];
      list.push(n);
      notesByDay.set(ymd, list);
    }
    for (const list of notesByDay.values()) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    const ticketsByDay = new Map<string, Ticket[]>();
    for (const t of tickets) {
      if (!t.dueDate) continue;
      const list = ticketsByDay.get(t.dueDate) ?? [];
      list.push(t);
      ticketsByDay.set(t.dueDate, list);
    }
    const priorityRank: Record<TicketPriority, number> = {
      urgent: 0, high: 1, medium: 2, low: 3,
    };
    for (const list of ticketsByDay.values()) {
      list.sort(
        (a, b) =>
          priorityRank[a.priority] - priorityRank[b.priority] ||
          a.title.localeCompare(b.title),
      );
    }
    return { notesByDay, ticketsByDay };
  }, [notes, tickets]);

  const priorityRank: Record<TicketPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const unscheduled = useMemo(() =>
    tickets
      .filter((t) => !t.dueDate && t.status !== "done" && t.status !== "archived")
      .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title)),
    [tickets],
  );
  const [unscheduledOpen, setUnscheduledOpen] = useState(true);

  function goPrev() {
    if (mode === "month") {
      const d = new Date(viewYear, viewMonth - 1, 1);
      setCursor(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`);
    } else if (mode === "week") {
      setCursor(shiftYMD(cursor, -7));
    } else {
      setCursor(shiftYMD(cursor, -1));
    }
  }
  function goNext() {
    if (mode === "month") {
      const d = new Date(viewYear, viewMonth + 1, 1);
      setCursor(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`);
    } else if (mode === "week") {
      setCursor(shiftYMD(cursor, 7));
    } else {
      setCursor(shiftYMD(cursor, 1));
    }
  }
  function goToday() { setCursor(today); }

  function handleDrop(targetYmd: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData(DRAG_MIME);
    if (!id) return;
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket || ticket.status === "done") return;
    if (ticket.dueDate === targetYmd) return;
    setDueDate(id, targetYmd);
  }

  function handleDragStart(t: Ticket, e: React.DragEvent) {
    if (t.status === "done") { e.preventDefault(); return; }
    e.dataTransfer.setData(DRAG_MIME, t.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function openPopup(ymd: string, noteId?: string) {
    setSelectedDay(ymd);
    setPopupInitialNoteId(noteId ?? null);
  }

  const headingLabel =
    mode === "month"
      ? monthLabel(viewYear, viewMonth)
      : mode === "week"
        ? weekRangeLabel(cursor, firstWeekday)
        : longDayLabel(cursor);

  const gridProps = {
    firstWeekday, labels, notesByDay, ticketsByDay, selectedDay,
    dragOver, setDragOver,
    onSelectDay: (ymd: string, noteId?: string) => openPopup(ymd, noteId),
    onOpenTicket: handleOpenTicket,
    onDragStartTicket: handleDragStart,
    onDropCell: handleDrop,
  };

  return (
    <div className="nk-calendar">
      <header className="nk-calendar-hd">
        <div className="nk-calendar-controls">
          <button className="nk-iconbtn" onClick={goPrev} title="Previous" aria-label="Previous">
            <ChevronLeft size={16} aria-hidden />
          </button>
          <h1 className="nk-calendar-title">{headingLabel}</h1>
          <button className="nk-iconbtn" onClick={goNext} title="Next" aria-label="Next">
            <ChevronRight size={16} aria-hidden />
          </button>
          <button className="nk-calendar-today" onClick={goToday} title="Jump to today">
            Today
          </button>
        </div>
        <div className="nk-calendar-modes" role="tablist">
          {(["month", "week", "day"] as Mode[]).map((m) => (
            <button
              key={m} role="tab" aria-selected={mode === m}
              className={"nk-calendar-mode" + (mode === m ? " active" : "")}
              onClick={() => setMode(m)}
            >
              {m[0]!.toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {mode === "month" && <MonthGrid year={viewYear} month={viewMonth} {...gridProps} />}
      {mode === "week" && <WeekStrip ymd={cursor} {...gridProps} />}
      {mode === "day" && (
        <DayPane
          ymd={cursor}
          notes={notesByDay.get(cursor) ?? []}
          tickets={ticketsByDay.get(cursor) ?? []}
          onOpenNote={(ymd, noteId) => openPopup(ymd, noteId)}
          onNewNote={(ymd) => openPopup(ymd)}
          onOpenTicket={handleOpenTicket}
          onNewTicket={(dueDate) => {
            const t = upsertTicket({ title: "New task", status: "todo", dueDate });
            setDetailId(t.id);
          }}
          onDragStartTicket={handleDragStart}
          onDropCell={handleDrop}
          dragOver={dragOver}
          setDragOver={setDragOver}
        />
      )}

      <section className="nk-heatmap-section">
        <button
          type="button" className="nk-heatmap-toggle"
          onClick={() => setHeatmapOpen((v) => !v)} aria-expanded={heatmapOpen}
        >
          {heatmapOpen ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
          <span>Activity heatmap</span>
        </button>
        {heatmapOpen && (
          <>
            <Heatmap onSelectDay={(ymd) => setHeatmapSelectedYmd(ymd)} selectedYmd={heatmapSelectedYmd} />
            {heatmapSelectedYmd && (
              <HeatmapDayPanel
                ymd={heatmapSelectedYmd}
                onClose={() => setHeatmapSelectedYmd(null)}
                onOpenJournal={onOpenJournal}
                hasJournal={(notesByDay.get(heatmapSelectedYmd)?.length ?? 0) > 0}
                tickets={ticketsByDay.get(heatmapSelectedYmd) ?? []}
              />
            )}
          </>
        )}
      </section>

      <section className="nk-heatmap-section">
        <button
          type="button" className="nk-heatmap-toggle"
          onClick={() => setUnscheduledOpen((v) => !v)} aria-expanded={unscheduledOpen}
        >
          {unscheduledOpen ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
          <span>Unscheduled ({unscheduled.length})</span>
          <button
            type="button"
            className="nk-iconbtn"
            style={{ marginLeft: "auto" }}
            title="New task"
            aria-label="New task"
            onClick={(e) => {
              e.stopPropagation();
              const t = upsertTicket({ title: "New task", status: "todo" });
              setDetailId(t.id);
            }}
          >
            <Plus size={12} aria-hidden />
          </button>
        </button>
        {unscheduledOpen && (
          <div className="nk-unscheduled-list">
            {unscheduled.length === 0 ? (
              <p className="nk-empty-hint">No unscheduled tasks. Drag a task here to unschedule it.</p>
            ) : (
              unscheduled.map((t) => (
                <button
                  key={t.id}
                  className={`nk-calendar-chip ${PRIORITY_CLASS[t.priority]}`}
                  draggable
                  onDragStart={(e) => handleDragStart(t, e)}
                  onClick={() => handleOpenTicket(t.id)}
                  title={`${t.title} (${PRIORITY_LABEL[t.priority]})`}
                >
                  <span className="nk-calendar-chip-priority">{PRIORITY_LABEL[t.priority]}</span>
                  <span className="nk-calendar-chip-title">{t.title}</span>
                </button>
              ))
            )}
          </div>
        )}
      </section>

      {selectedDay && mode !== "day" && (
        <DayPopup
          ymd={selectedDay}
          notes={notesByDay.get(selectedDay) ?? []}
          tickets={ticketsByDay.get(selectedDay) ?? []}
          initialNoteId={popupInitialNoteId}
          onClose={() => { setSelectedDay(null); setPopupInitialNoteId(null); }}
          onOpenTicket={handleOpenTicket}
          onNewTicket={(dueDate) => {
            const t = upsertTicket({ title: "New task", status: "todo", dueDate });
            setDetailId(t.id);
          }}
        />
      )}

      {detailId && (
        <TicketDetail ticketId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

// ── Day popup ─────────────────────────────────────────────────────

type PopupMode =
  | { kind: "list" }
  | { kind: "edit"; noteId: string; title: string; body: string };

interface DayPopupProps {
  ymd: string;
  notes: Note[];
  tickets: Ticket[];
  initialNoteId: string | null;
  onClose: () => void;
  onOpenTicket?: (ticketId: string) => void;
  onNewTicket?: (dueDate: string) => void;
}

function DayPopup({ ymd, notes, tickets, initialNoteId, onClose, onOpenTicket, onNewTicket }: DayPopupProps) {
  const upsert = useNotesStore((s) => s.upsert);

  const [mode, setMode] = useState<PopupMode>(() => {
    if (initialNoteId) {
      const note = notes.find((n) => n.id === initialNoteId);
      if (note) return { kind: "edit", noteId: note.id, title: note.title, body: note.body };
    }
    return { kind: "list" };
  });

  // Debounced save while editing
  useEffect(() => {
    if (mode.kind !== "edit") return;
    const { noteId, title, body } = mode;
    const timer = setTimeout(() => {
      upsert({ id: noteId, title, body });
    }, 600);
    return () => clearTimeout(timer);
  }, [mode, upsert]);

  function openNote(note: Note) {
    setMode({ kind: "edit", noteId: note.id, title: note.title, body: note.body });
  }

  function createNote() {
    const id = nanoid(12);
    upsert({ id, title: "", body: "", path: dayNotePathFor(ymd, id) });
    setMode({ kind: "edit", noteId: id, title: "", body: "" });
  }

  function saveAndClose() {
    if (mode.kind === "edit") {
      upsert({ id: mode.noteId, title: mode.title, body: mode.body });
    }
    onClose();
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) saveAndClose();
  }

  return (
    <div className="nk-popup-overlay" onClick={handleOverlayClick}>
      <div className="nk-popup" role="dialog" aria-modal="true">
        <header className="nk-popup-hd">
          <div className="nk-popup-hd-left">
            {mode.kind === "edit" && (
              <button
                className="nk-popup-back"
                onClick={() => setMode({ kind: "list" })}
                aria-label="Back to list"
              >
                ←
              </button>
            )}
            <div>
              <h3 className="nk-popup-title">{longDayLabel(ymd)}</h3>
              <p className="nk-popup-sub">{ymd}</p>
            </div>
          </div>
          <button className="nk-iconbtn" onClick={saveAndClose} aria-label="Close">
            <X size={14} aria-hidden />
          </button>
        </header>

        {mode.kind === "list" && (
          <div className="nk-popup-body">
            {notes.length === 0 && (
              <p className="nk-empty-hint">No notes for this day yet.</p>
            )}
            {notes.map((n) => (
              <button key={n.id} className="nk-popup-note-item" onClick={() => openNote(n)}>
                <span className="nk-popup-note-title">{n.title || "Untitled"}</span>
                {n.body && (
                  <span className="nk-popup-note-preview">
                    {n.body.replace(/^#+\s*/gm, "").trim().slice(0, 60)}
                  </span>
                )}
              </button>
            ))}
            <button className="nk-day-panel-action" onClick={createNote}>
              + New note
            </button>
            <section className="nk-popup-tickets">
              <h5 className="nk-calendar-section-title">Tasks ({tickets.length})</h5>
              {tickets.length > 0 && (
                <ul className="nk-day-panel-list">
                  {tickets.map((t) => (
                    <li key={t.id}>
                      <button
                        className={`nk-day-panel-ticket ${PRIORITY_CLASS[t.priority]}`}
                        onClick={() => { onOpenTicket?.(t.id); onClose(); }}
                      >
                        <span className="nk-calendar-chip-priority">{PRIORITY_LABEL[t.priority]}</span>
                        <span className="nk-day-panel-ticket-title">{t.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                className="nk-day-panel-action"
                onClick={() => { onNewTicket?.(ymd); onClose(); }}
              >
                + New task
              </button>
            </section>
          </div>
        )}

        {mode.kind === "edit" && (
          <div className="nk-popup-body nk-popup-body--edit">
            <input
              className="nk-popup-title-input"
              value={mode.title}
              onChange={(e) =>
                setMode((prev) =>
                  prev.kind === "edit" ? { ...prev, title: e.target.value } : prev,
                )
              }
              placeholder="Note title…"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <textarea
              className="nk-popup-textarea"
              value={mode.body}
              onChange={(e) =>
                setMode((prev) =>
                  prev.kind === "edit" ? { ...prev, body: e.target.value } : prev,
                )
              }
              placeholder="Write something…"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Heatmap day panel ─────────────────────────────────────────────

interface HeatmapDayPanelProps {
  ymd: string;
  hasJournal: boolean;
  tickets: Ticket[];
  onClose: () => void;
  onOpenJournal?: (ymd: string) => void;
}

function HeatmapDayPanel({ ymd, hasJournal, tickets, onClose, onOpenJournal }: HeatmapDayPanelProps) {
  const [commits, setCommits] = useState<VaultCommit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCommits(null);
    setError(null);
    (async () => {
      try {
        const res = await listCommits(undefined, 500);
        if (cancelled) return;
        const filtered = res.commits.filter((c) => {
          const d = new Date(c.authoredAt);
          if (Number.isNaN(d.getTime())) return false;
          const y = d.getFullYear();
          const mo = d.getMonth() + 1;
          const day = d.getDate();
          const dymd = `${y}-${mo < 10 ? "0" : ""}${mo}-${day < 10 ? "0" : ""}${day}`;
          return dymd === ymd;
        });
        setCommits(filtered);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [ymd]);

  return (
    <aside className="nk-heatmap-day">
      <header className="nk-heatmap-day-hd">
        <div>
          <h4 className="nk-heatmap-day-title">{longDayLabel(ymd)}</h4>
          <p className="nk-heatmap-day-sub">{ymd}</p>
        </div>
        <button className="nk-iconbtn" onClick={onClose} title="Close" aria-label="Close">
          <X size={14} aria-hidden />
        </button>
      </header>
      <div className="nk-heatmap-day-row">
        <div className="nk-heatmap-day-col">
          <h5 className="nk-calendar-section-title">Commits</h5>
          {error && <div className="nk-history-error">Failed: {error}</div>}
          {!error && commits === null && <SkeletonCommitList count={3} />}
          {commits && commits.length === 0 && <p className="nk-empty-hint">No commits this day.</p>}
          {commits && commits.length > 0 && (
            <ol className="nk-heatmap-commits">
              {commits.map((c) => (
                <li key={c.sha}>
                  <a href={c.url} target="_blank" rel="noreferrer" className="nk-heatmap-commit">
                    <span className="nk-heatmap-commit-msg">{c.message.split("\n")[0]}</span>
                    <span className="nk-heatmap-commit-meta">
                      {c.authorLogin ?? c.authorName ?? "unknown"}{" · "}{c.sha.slice(0, 7)}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="nk-heatmap-day-col">
          <h5 className="nk-calendar-section-title">Due ({tickets.length})</h5>
          {tickets.length === 0 ? (
            <p className="nk-empty-hint">No tickets due.</p>
          ) : (
            <ul className="nk-heatmap-due">
              {tickets.map((t) => (
                <li key={t.id}>
                  <span className={`nk-chip ${PRIORITY_CLASS[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span>{" "}{t.title}
                </li>
              ))}
            </ul>
          )}
          <button
            className="nk-signin-btn"
            style={{ maxWidth: 220, marginTop: 12 }}
            onClick={() => onOpenJournal?.(ymd)}
          >
            {hasJournal ? "Open journal" : "Start a journal entry"}
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── Grid components ───────────────────────────────────────────────

interface GridProps {
  firstWeekday: number;
  labels: string[];
  notesByDay: Map<string, Note[]>;
  ticketsByDay: Map<string, Ticket[]>;
  selectedDay: string | null;
  dragOver: string | null;
  setDragOver: (v: string | null) => void;
  onSelectDay: (ymd: string, noteId?: string) => void;
  onOpenTicket?: (id: string) => void;
  onDragStartTicket: (t: Ticket, e: React.DragEvent) => void;
  onDropCell: (ymd: string, e: React.DragEvent) => void;
}

function MonthGrid({ year, month, ...rest }: GridProps & { year: number; month: number }) {
  const weeks = useMemo(() => buildMonthGrid(year, month, rest.firstWeekday), [year, month, rest.firstWeekday]);
  return (
    <div className="nk-calendar-grid">
      <div className="nk-calendar-weekdays">
        {rest.labels.map((l) => <div key={l} className="nk-calendar-weekday">{l}</div>)}
      </div>
      <div className="nk-calendar-weeks">
        {weeks.map((week, wi) => (
          <div key={wi} className="nk-calendar-week">
            {week.map((cell) => <DayCell key={cell.ymd} cell={cell} {...rest} variant="month" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekStrip({ ymd, ...rest }: GridProps & { ymd: string }) {
  const week = useMemo(() => buildWeekGrid(ymd, rest.firstWeekday), [ymd, rest.firstWeekday]);
  return (
    <div className="nk-calendar-grid nk-calendar-grid--week">
      <div className="nk-calendar-weekdays">
        {rest.labels.map((l) => <div key={l} className="nk-calendar-weekday">{l}</div>)}
      </div>
      <div className="nk-calendar-week nk-calendar-week--tall">
        {week.map((cell) => <DayCell key={cell.ymd} cell={cell} {...rest} variant="week" />)}
      </div>
    </div>
  );
}

interface DayCellProps extends GridProps {
  cell: GridCell;
  variant: "month" | "week";
}

function DayCell({
  cell, variant, notesByDay, ticketsByDay, selectedDay,
  dragOver, setDragOver, onSelectDay, onOpenTicket, onDragStartTicket, onDropCell,
}: DayCellProps) {
  const dayNotes = notesByDay.get(cell.ymd) ?? [];
  const dayTickets = ticketsByDay.get(cell.ymd) ?? [];

  type Item =
    | { kind: "note"; note: Note }
    | { kind: "ticket"; ticket: Ticket };
  const allItems: Item[] = [
    ...dayNotes.map((n): Item => ({ kind: "note", note: n })),
    ...dayTickets.map((t): Item => ({ kind: "ticket", ticket: t })),
  ];
  const visible = allItems.slice(0, MAX_CHIPS_PER_CELL);
  const overflow = allItems.length - visible.length;

  const isSelected = selectedDay === cell.ymd;
  const isOver = dragOver === cell.ymd;

  return (
    <div
      className={
        "nk-calendar-cell" +
        ` nk-calendar-cell--${variant}` +
        (cell.inMonth ? "" : " out") +
        (cell.isToday ? " today" : "") +
        (isOver ? " drop-target" : "") +
        (isSelected ? " selected" : "")
      }
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".nk-calendar-chip")) return;
        onSelectDay(cell.ymd);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOver !== cell.ymd) setDragOver(cell.ymd);
      }}
      onDragLeave={() => { if (dragOver === cell.ymd) setDragOver(null); }}
      onDrop={(e) => onDropCell(cell.ymd, e)}
    >
      <header className="nk-calendar-cell-hd">
        <span className="nk-calendar-cell-num">{cell.date.getDate()}</span>
      </header>
      <div className="nk-calendar-cell-body">
        {visible.map((item) =>
          item.kind === "note" ? (
            <NoteChip
              key={item.note.id}
              note={item.note}
              onClick={() => onSelectDay(cell.ymd, item.note.id)}
            />
          ) : (
            <TicketChip
              key={item.ticket.id}
              ticket={item.ticket}
              onClick={() => onOpenTicket?.(item.ticket.id)}
              onDragStart={(e) => onDragStartTicket(item.ticket, e)}
            />
          )
        )}
        {overflow > 0 && (
          <span className="nk-calendar-overflow">+{overflow} more</span>
        )}
      </div>
    </div>
  );
}

// ── Chips ─────────────────────────────────────────────────────────

function NoteChip({ note, onClick }: { note: Note; onClick: () => void }) {
  return (
    <button
      className="nk-calendar-chip nk-calendar-chip--note"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={note.title || "Untitled"}
    >
      <span className="nk-calendar-chip-title">{note.title || "Untitled"}</span>
    </button>
  );
}

interface TicketChipProps {
  ticket: Ticket;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

function TicketChip({ ticket, onClick, onDragStart }: TicketChipProps) {
  const frozen = ticket.status === "done";
  return (
    <button
      className={
        "nk-calendar-chip" +
        ` ${PRIORITY_CLASS[ticket.priority]}` +
        (frozen ? " frozen" : "")
      }
      draggable={!frozen}
      onDragStart={onDragStart}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={
        frozen
          ? `${ticket.title} — reopen to reschedule`
          : `${ticket.title} (${PRIORITY_LABEL[ticket.priority]})`
      }
    >
      <span className="nk-calendar-chip-priority">{PRIORITY_LABEL[ticket.priority]}</span>
      <span className="nk-calendar-chip-title">{ticket.title}</span>
    </button>
  );
}

// ── Day pane (day-view mode) ──────────────────────────────────────

interface DayPaneProps {
  ymd: string;
  notes: Note[];
  tickets: Ticket[];
  dragOver: string | null;
  setDragOver: (v: string | null) => void;
  onOpenNote: (ymd: string, noteId: string) => void;
  onNewNote: (ymd: string) => void;
  onOpenTicket?: (id: string) => void;
  onNewTicket?: (dueDate: string) => void;
  onDragStartTicket: (t: Ticket, e: React.DragEvent) => void;
  onDropCell: (ymd: string, e: React.DragEvent) => void;
}

function DayPane({
  ymd, notes, tickets, dragOver, setDragOver,
  onOpenNote, onNewNote, onOpenTicket, onNewTicket, onDragStartTicket, onDropCell,
}: DayPaneProps) {
  const isOver = dragOver === ymd;
  return (
    <div
      className={"nk-calendar-day-pane" + (isOver ? " drop-target" : "")}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!isOver) setDragOver(ymd);
      }}
      onDragLeave={() => { if (isOver) setDragOver(null); }}
      onDrop={(e) => onDropCell(ymd, e)}
    >
      <header className="nk-calendar-day-hd">
        <h2 className="nk-calendar-day-title">{longDayLabel(ymd)}</h2>
        <button className="nk-signin-btn" style={{ maxWidth: 140 }} onClick={() => onNewNote(ymd)}>
          + New note
        </button>
      </header>
      <section>
        <h3 className="nk-calendar-section-title">Notes ({notes.length})</h3>
        {notes.length === 0 ? (
          <p className="nk-empty-hint">No notes for this day.</p>
        ) : (
          <ul className="nk-calendar-day-tickets">
            {notes.map((n) => (
              <li key={n.id}>
                <button className="nk-day-panel-note" onClick={() => onOpenNote(ymd, n.id)}>
                  {n.title || "Untitled"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="nk-calendar-section-title">Tasks ({tickets.length})</h3>
        {tickets.length === 0 ? (
          <p className="nk-empty-hint">No tasks due this day.</p>
        ) : (
          <ul className="nk-calendar-day-tickets">
            {tickets.map((t) => (
              <li key={t.id}>
                <TicketChip
                  ticket={t}
                  onClick={() => onOpenTicket?.(t.id)}
                  onDragStart={(e) => onDragStartTicket(t, e)}
                />
              </li>
            ))}
          </ul>
        )}
        <button className="nk-day-panel-action" onClick={() => onNewTicket?.(ymd)}>
          + New task
        </button>
      </section>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function weekRangeLabel(ymd: string, firstWeekday: number): string {
  const week = buildWeekGrid(ymd, firstWeekday);
  const first = week[0];
  const last = week[6];
  if (!first || !last) return ymd;
  const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  return `${fmt.format(first.date)} – ${fmt.format(last.date)}, ${first.date.getFullYear()}`;
}

function longDayLabel(ymd: string): string {
  const d = parseYMD(ymd);
  if (!d) return ymd;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(d);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
