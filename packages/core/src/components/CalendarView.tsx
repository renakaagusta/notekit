import { useEffect, useMemo, useState } from "react";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import type { Ticket, TicketPriority } from "../types/ticket";
import {
  buildMonthGrid,
  buildWeekGrid,
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

interface CalendarViewProps {
  /** Called when the user opens a specific day's journal. */
  onOpenJournal?: (ymd: string) => void;
  /** Called when the user clicks a ticket chip (defaults to switching to tickets view). */
  onOpenTicket?: (ticketId: string) => void;
}

export function CalendarView({ onOpenJournal, onOpenTicket }: CalendarViewProps) {
  const notes = useNotesStore((s) => s.all());
  const tickets = useTicketsStore((s) => s.all());
  const setDueDate = useTicketsStore((s) => s.setDueDate);

  const today = todayYMD();
  const [cursor, setCursor] = useState(today);
  const [mode, setMode] = useState<Mode>("month");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [heatmapOpen, setHeatmapOpen] = useState(true);
  const [heatmapSelectedYmd, setHeatmapSelectedYmd] = useState<string | null>(null);

  const firstWeekday = useMemo(() => localeFirstWeekday(), []);
  const labels = useMemo(() => weekdayLabels(firstWeekday), [firstWeekday]);

  const cursorDate = parseYMD(cursor) ?? new Date();
  const viewYear = cursorDate.getFullYear();
  const viewMonth = cursorDate.getMonth();

  // Lookup tables: which days have a journal note; which tickets are due on which day.
  const { journalDays, ticketsByDay } = useMemo(() => {
    const journalDays = new Set<string>();
    for (const n of notes) {
      const ymd = journalYMDFromPath(n.path);
      if (ymd) journalDays.add(ymd);
    }
    const ticketsByDay = new Map<string, Ticket[]>();
    for (const t of tickets) {
      if (!t.dueDate) continue;
      const list = ticketsByDay.get(t.dueDate) ?? [];
      list.push(t);
      ticketsByDay.set(t.dueDate, list);
    }
    // Stable order: urgent first, then by title.
    const priorityRank: Record<TicketPriority, number> = {
      urgent: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    for (const list of ticketsByDay.values()) {
      list.sort(
        (a, b) =>
          priorityRank[a.priority] - priorityRank[b.priority] ||
          a.title.localeCompare(b.title),
      );
    }
    return { journalDays, ticketsByDay };
  }, [notes, tickets]);

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
  function goToday() {
    setCursor(today);
  }

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
    if (t.status === "done") {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(DRAG_MIME, t.id);
    e.dataTransfer.effectAllowed = "move";
  }

  const headingLabel =
    mode === "month"
      ? monthLabel(viewYear, viewMonth)
      : mode === "week"
        ? weekRangeLabel(cursor, firstWeekday)
        : longDayLabel(cursor);

  return (
    <div className="nk-calendar">
      <header className="nk-calendar-hd">
        <div className="nk-calendar-controls">
          <button
            className="nk-iconbtn"
            onClick={goPrev}
            title="Previous"
            aria-label="Previous"
          >
            ‹
          </button>
          <h1 className="nk-calendar-title">{headingLabel}</h1>
          <button
            className="nk-iconbtn"
            onClick={goNext}
            title="Next"
            aria-label="Next"
          >
            ›
          </button>
          <button
            className="nk-calendar-today"
            onClick={goToday}
            title="Jump to today"
          >
            Today
          </button>
        </div>
        <div className="nk-calendar-modes" role="tablist">
          {(["month", "week", "day"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={"nk-calendar-mode" + (mode === m ? " active" : "")}
              onClick={() => setMode(m)}
            >
              {m[0]!.toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </header>

      {mode === "month" && (
        <MonthGrid
          year={viewYear}
          month={viewMonth}
          firstWeekday={firstWeekday}
          labels={labels}
          journalDays={journalDays}
          ticketsByDay={ticketsByDay}
          dragOver={dragOver}
          setDragOver={setDragOver}
          onOpenJournal={onOpenJournal}
          onOpenTicket={onOpenTicket}
          onDragStartTicket={handleDragStart}
          onDropCell={handleDrop}
        />
      )}

      {mode === "week" && (
        <WeekStrip
          ymd={cursor}
          firstWeekday={firstWeekday}
          labels={labels}
          journalDays={journalDays}
          ticketsByDay={ticketsByDay}
          dragOver={dragOver}
          setDragOver={setDragOver}
          onOpenJournal={onOpenJournal}
          onOpenTicket={onOpenTicket}
          onDragStartTicket={handleDragStart}
          onDropCell={handleDrop}
        />
      )}

      {mode === "day" && (
        <DayPane
          ymd={cursor}
          hasJournal={journalDays.has(cursor)}
          tickets={ticketsByDay.get(cursor) ?? []}
          onOpenJournal={onOpenJournal}
          onOpenTicket={onOpenTicket}
          onDragStartTicket={handleDragStart}
          onDropCell={handleDrop}
          dragOver={dragOver}
          setDragOver={setDragOver}
        />
      )}

      <section className="nk-heatmap-section">
        <button
          type="button"
          className="nk-heatmap-toggle"
          onClick={() => setHeatmapOpen((v) => !v)}
          aria-expanded={heatmapOpen}
        >
          <span aria-hidden>{heatmapOpen ? "▾" : "▸"}</span>
          <span>Activity heatmap</span>
        </button>
        {heatmapOpen && (
          <>
            <Heatmap
              onSelectDay={(ymd) => setHeatmapSelectedYmd(ymd)}
              selectedYmd={heatmapSelectedYmd}
            />
            {heatmapSelectedYmd && (
              <HeatmapDayPanel
                ymd={heatmapSelectedYmd}
                onClose={() => setHeatmapSelectedYmd(null)}
                onOpenJournal={onOpenJournal}
                hasJournal={journalDays.has(heatmapSelectedYmd)}
                tickets={ticketsByDay.get(heatmapSelectedYmd) ?? []}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

interface HeatmapDayPanelProps {
  ymd: string;
  hasJournal: boolean;
  tickets: Ticket[];
  onClose: () => void;
  onOpenJournal?: (ymd: string) => void;
}

function HeatmapDayPanel({
  ymd,
  hasJournal,
  tickets,
  onClose,
  onOpenJournal,
}: HeatmapDayPanelProps) {
  const [commits, setCommits] = useState<VaultCommit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCommits(null);
    setError(null);
    (async () => {
      try {
        // Pull a wide window; filter by day client-side.
        const res = await listCommits(undefined, 500);
        if (cancelled) return;
        const filtered = res.commits.filter((c) => {
          const d = new Date(c.authoredAt);
          if (Number.isNaN(d.getTime())) return false;
          const y = d.getFullYear();
          const m = d.getMonth() + 1;
          const day = d.getDate();
          const dymd = `${y}-${m < 10 ? "0" : ""}${m}-${day < 10 ? "0" : ""}${day}`;
          return dymd === ymd;
        });
        setCommits(filtered);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ymd]);

  return (
    <aside className="nk-heatmap-day">
      <header className="nk-heatmap-day-hd">
        <div>
          <h4 className="nk-heatmap-day-title">{longDayLabel(ymd)}</h4>
          <p className="nk-heatmap-day-sub">{ymd}</p>
        </div>
        <button
          className="nk-iconbtn"
          onClick={onClose}
          title="Close"
          aria-label="Close"
        >
          ×
        </button>
      </header>

      <div className="nk-heatmap-day-row">
        <div className="nk-heatmap-day-col">
          <h5 className="nk-calendar-section-title">Commits</h5>
          {error && <div className="nk-history-error">Failed: {error}</div>}
          {!error && commits === null && (
            <p className="nk-empty-hint">Loading…</p>
          )}
          {commits && commits.length === 0 && (
            <p className="nk-empty-hint">No commits this day.</p>
          )}
          {commits && commits.length > 0 && (
            <ol className="nk-heatmap-commits">
              {commits.map((c) => (
                <li key={c.sha}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="nk-heatmap-commit"
                  >
                    <span className="nk-heatmap-commit-msg">
                      {c.message.split("\n")[0]}
                    </span>
                    <span className="nk-heatmap-commit-meta">
                      {c.authorLogin ?? c.authorName ?? "unknown"}
                      {" · "}
                      {c.sha.slice(0, 7)}
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
                  <span className={`nk-chip ${PRIORITY_CLASS[t.priority]}`}>
                    {PRIORITY_LABEL[t.priority]}
                  </span>{" "}
                  {t.title}
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

interface GridProps {
  firstWeekday: number;
  labels: string[];
  journalDays: Set<string>;
  ticketsByDay: Map<string, Ticket[]>;
  dragOver: string | null;
  setDragOver: (v: string | null) => void;
  onOpenJournal?: (ymd: string) => void;
  onOpenTicket?: (id: string) => void;
  onDragStartTicket: (t: Ticket, e: React.DragEvent) => void;
  onDropCell: (ymd: string, e: React.DragEvent) => void;
}

function MonthGrid({
  year,
  month,
  ...rest
}: GridProps & { year: number; month: number }) {
  const weeks = useMemo(
    () => buildMonthGrid(year, month, rest.firstWeekday),
    [year, month, rest.firstWeekday],
  );
  return (
    <div className="nk-calendar-grid">
      <div className="nk-calendar-weekdays">
        {rest.labels.map((l) => (
          <div key={l} className="nk-calendar-weekday">
            {l}
          </div>
        ))}
      </div>
      <div className="nk-calendar-weeks">
        {weeks.map((week, wi) => (
          <div key={wi} className="nk-calendar-week">
            {week.map((cell) => (
              <DayCell key={cell.ymd} cell={cell} {...rest} variant="month" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekStrip({ ymd, ...rest }: GridProps & { ymd: string }) {
  const week = useMemo(
    () => buildWeekGrid(ymd, rest.firstWeekday),
    [ymd, rest.firstWeekday],
  );
  return (
    <div className="nk-calendar-grid nk-calendar-grid--week">
      <div className="nk-calendar-weekdays">
        {rest.labels.map((l) => (
          <div key={l} className="nk-calendar-weekday">
            {l}
          </div>
        ))}
      </div>
      <div className="nk-calendar-week nk-calendar-week--tall">
        {week.map((cell) => (
          <DayCell key={cell.ymd} cell={cell} {...rest} variant="week" />
        ))}
      </div>
    </div>
  );
}

interface DayCellProps extends GridProps {
  cell: GridCell;
  variant: "month" | "week";
}

function DayCell({
  cell,
  variant,
  journalDays,
  ticketsByDay,
  dragOver,
  setDragOver,
  onOpenJournal,
  onOpenTicket,
  onDragStartTicket,
  onDropCell,
}: DayCellProps) {
  const hasNote = journalDays.has(cell.ymd);
  const dayTickets = ticketsByDay.get(cell.ymd) ?? [];
  const visible = dayTickets.slice(0, MAX_CHIPS_PER_CELL);
  const overflow = dayTickets.length - visible.length;
  const isOver = dragOver === cell.ymd;
  const dayOfMonth = cell.date.getDate();

  return (
    <div
      className={
        "nk-calendar-cell" +
        ` nk-calendar-cell--${variant}` +
        (cell.inMonth ? "" : " out") +
        (cell.isToday ? " today" : "") +
        (isOver ? " drop-target" : "")
      }
      onClick={(e) => {
        // Don't open the journal if the click landed on a chip.
        if ((e.target as HTMLElement).closest(".nk-calendar-chip")) return;
        onOpenJournal?.(cell.ymd);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOver !== cell.ymd) setDragOver(cell.ymd);
      }}
      onDragLeave={() => {
        if (dragOver === cell.ymd) setDragOver(null);
      }}
      onDrop={(e) => onDropCell(cell.ymd, e)}
    >
      <header className="nk-calendar-cell-hd">
        <span className="nk-calendar-cell-num">{dayOfMonth}</span>
        {hasNote && (
          <span
            className="nk-calendar-cell-dot"
            title="Has a journal entry"
            aria-label="Has a journal entry"
          />
        )}
      </header>
      <div className="nk-calendar-cell-body">
        {visible.map((t) => (
          <TicketChip
            key={t.id}
            ticket={t}
            onClick={() => onOpenTicket?.(t.id)}
            onDragStart={(e) => onDragStartTicket(t, e)}
          />
        ))}
        {overflow > 0 && (
          <span className="nk-calendar-overflow">+{overflow} more</span>
        )}
      </div>
    </div>
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
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={
        frozen
          ? `${ticket.title} — reopen to reschedule`
          : `${ticket.title} (${PRIORITY_LABEL[ticket.priority]})`
      }
    >
      <span className="nk-calendar-chip-priority">
        {PRIORITY_LABEL[ticket.priority]}
      </span>
      <span className="nk-calendar-chip-title">{ticket.title}</span>
    </button>
  );
}

interface DayPaneProps {
  ymd: string;
  hasJournal: boolean;
  tickets: Ticket[];
  dragOver: string | null;
  setDragOver: (v: string | null) => void;
  onOpenJournal?: (ymd: string) => void;
  onOpenTicket?: (id: string) => void;
  onDragStartTicket: (t: Ticket, e: React.DragEvent) => void;
  onDropCell: (ymd: string, e: React.DragEvent) => void;
}

function DayPane({
  ymd,
  hasJournal,
  tickets,
  dragOver,
  setDragOver,
  onOpenJournal,
  onOpenTicket,
  onDragStartTicket,
  onDropCell,
}: DayPaneProps) {
  const isOver = dragOver === ymd;
  return (
    <div
      className={
        "nk-calendar-day-pane" + (isOver ? " drop-target" : "")
      }
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!isOver) setDragOver(ymd);
      }}
      onDragLeave={() => {
        if (isOver) setDragOver(null);
      }}
      onDrop={(e) => onDropCell(ymd, e)}
    >
      <header className="nk-calendar-day-hd">
        <h2 className="nk-calendar-day-title">{longDayLabel(ymd)}</h2>
        <button
          className="nk-signin-btn"
          style={{ maxWidth: 180 }}
          onClick={() => onOpenJournal?.(ymd)}
        >
          {hasJournal ? "Open journal" : "Start a journal entry"}
        </button>
      </header>
      <section>
        <h3 className="nk-calendar-section-title">
          Due ({tickets.length})
        </h3>
        {tickets.length === 0 ? (
          <p className="nk-empty-hint">No tickets due this day.</p>
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
      </section>
    </div>
  );
}

function weekRangeLabel(ymd: string, firstWeekday: number): string {
  const week = buildWeekGrid(ymd, firstWeekday);
  const first = week[0];
  const last = week[6];
  if (!first || !last) return ymd;
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  const yearSuffix = first.date.getFullYear();
  return `${fmt.format(first.date)} – ${fmt.format(last.date)}, ${yearSuffix}`;
}

function longDayLabel(ymd: string): string {
  const d = parseYMD(ymd);
  if (!d) return ymd;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
