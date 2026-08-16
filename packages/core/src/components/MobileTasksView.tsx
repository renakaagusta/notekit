import { Check, ChevronLeft, ChevronRight, Circle, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { todayYMD } from "../lib/journal";
import { resolveAssignee } from "../lib/members";
import { useMembersStore } from "../stores/membersStore";
import { useTicketsStore } from "../stores/ticketsStore";
import type { Ticket, TicketPriority, TicketStatus } from "../types/ticket";
import { TicketDetail } from "./TicketDetail";

interface MobileTasksViewProps {
  userName?: string | null;
  focusTicket?: { id: string; seq: number } | null;
}

const PRIORITY_WORD: Record<TicketPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};
const STATUS_WORD: Record<TicketStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  archived: "Archived",
};
const PRIORITY_ORDER: Record<TicketPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
// The mobile filter row mirrors the mockup: Low / Medium / High (+ Urgent).
const FILTER_PRIORITIES: TicketPriority[] = ["urgent", "high", "medium", "low"];

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Date helpers (local-time, YYYY-MM-DD) ────────────────────────────────────
function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
function ymdOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(ymd: string, n: number): string {
  const d = parseYMD(ymd);
  d.setDate(d.getDate() + n);
  return ymdOf(d);
}
// The seven days (Sun→Sat) of the week containing `ymd`.
function weekOf(ymd: string): string[] {
  const start = parseYMD(ymd);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return ymdOf(d);
  });
}
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

// eslint-disable-next-line max-lines-per-function -- self-contained mobile agenda screen: header + week strip + filters + list + detail overlay
export function MobileTasksView({ userName, focusTicket }: MobileTasksViewProps) {
  const tickets = useTicketsStore((s) => s.all());
  const upsert = useTicketsStore((s) => s.upsert);
  const setStatus = useTicketsStore((s) => s.setStatus);
  const membersStatus = useMembersStore((s) => s.status);
  const members = useMembersStore((s) => s.members);
  const loadMembers = useMembersStore((s) => s.load);

  const [selected, setSelected] = useState<string>(() => todayYMD());
  const [priorityFilter, setPriorityFilter] = useState<Set<TicketPriority>>(new Set());
  // Deep-link (e.g. from a notification) opens the ticket detail directly.
  // Derive the initial detailId lazily from focusTicket so we don't call
  // setState inside an effect (react-hooks/set-state-in-effect).
  const [detailId, setDetailId] = useState<string | null>(() => focusTicket?.id ?? null);

  useEffect(() => {
    if (membersStatus === "idle") void loadMembers();
  }, [membersStatus, loadMembers]);

  const today = todayYMD();
  const week = useMemo(() => weekOf(selected), [selected]);
  const selDate = parseYMD(selected);

  const passesFilter = useCallback(
    (t: Ticket) => priorityFilter.size === 0 || priorityFilter.has(t.priority),
    [priorityFilter],
  );
  const sortTickets = (list: Ticket[]) =>
    [...list].sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title),
    );

  const dayTasks = useMemo(
    () => sortTickets(tickets.filter((t) => t.dueDate === selected && passesFilter(t))),
    [tickets, selected, passesFilter],
  );
  const unscheduled = useMemo(
    () =>
      sortTickets(
        tickets.filter(
          (t) => !t.dueDate && t.status !== "done" && t.status !== "archived" && passesFilter(t),
        ),
      ),
    [tickets, passesFilter],
  );

  function togglePriority(p: TicketPriority) {
    setPriorityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function createTask() {
    const t = upsert({ title: "Untitled task", status: "todo", priority: "medium", dueDate: selected });
    setDetailId(t.id);
  }

  function avatarFor(t: Ticket): string {
    const ref = resolveAssignee(t.assignee ?? t.createdBy, members);
    return (ref?.display ?? "?").slice(0, 1).toUpperCase();
  }

  return (
    <div className="nk-magenda">
      <div className="nk-magenda-scroll">
        {/* Greeting + month */}
        <header className="nk-magenda-hd">
          <div className="nk-magenda-greet">
            <span className="nk-magenda-greet-sub">{greeting()},</span>
            <strong className="nk-magenda-greet-name">{userName?.trim() || "there"}</strong>
          </div>
          <div className="nk-magenda-month">
            <button
              className="nk-magenda-monthnav"
              aria-label="Previous week"
              onClick={() => setSelected((s) => addDays(s, -7))}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <span className="nk-magenda-monthlabel">
              {MONTH[selDate.getMonth()]} {selDate.getFullYear()}
            </span>
            <button
              className="nk-magenda-monthnav"
              aria-label="Next week"
              onClick={() => setSelected((s) => addDays(s, 7))}
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        </header>

        {/* Week strip */}
        <div className="nk-magenda-week" role="tablist" aria-label="Days of the week">
          {week.map((ymd) => {
            const d = parseYMD(ymd);
            const isSel = ymd === selected;
            const isToday = ymd === today;
            return (
              <button
                key={ymd}
                role="tab"
                aria-selected={isSel}
                className={"nk-magenda-day" + (isSel ? " is-sel" : "") + (isToday ? " is-today" : "")}
                onClick={() => setSelected(ymd)}
              >
                <span className="nk-magenda-day-name">{WEEKDAY[d.getDay()]}</span>
                <span className="nk-magenda-day-num">{d.getDate()}</span>
              </button>
            );
          })}
        </div>

        {/* Priority filter */}
        <div className="nk-magenda-filters">
          <span className="nk-magenda-filters-label">Priority Level</span>
          <div className="nk-magenda-chips">
            {FILTER_PRIORITIES.map((p) => (
              <button
                key={p}
                className={`nk-magenda-chip priority-${p}` + (priorityFilter.has(p) ? " is-on" : "")}
                aria-pressed={priorityFilter.has(p)}
                onClick={() => togglePriority(p)}
              >
                {PRIORITY_WORD[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Tasks for the selected day */}
        <ul className="nk-magenda-list">
          {dayTasks.length === 0 && (
            <li className="nk-magenda-empty">No tasks for this day.</li>
          )}
          {dayTasks.map((t) => (
            <TaskRow
              key={t.id}
              t={t}
              initial={avatarFor(t)}
              onOpen={() => setDetailId(t.id)}
              onToggle={() => setStatus(t.id, t.status === "done" ? "todo" : "done")}
            />
          ))}
        </ul>

        {/* Unscheduled */}
        {unscheduled.length > 0 && (
          <>
            <div className="nk-magenda-section">Unscheduled</div>
            <ul className="nk-magenda-list">
              {unscheduled.map((t) => (
                <TaskRow
                  key={t.id}
                  t={t}
                  initial={avatarFor(t)}
                  onOpen={() => setDetailId(t.id)}
                  onToggle={() => setStatus(t.id, t.status === "done" ? "todo" : "done")}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <button className="nk-magenda-fab" aria-label="New task" onClick={createTask}>
        <Plus size={22} aria-hidden />
      </button>

      {detailId && <TicketDetail ticketId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function TaskRow({
  t,
  initial,
  onOpen,
  onToggle,
}: {
  t: Ticket;
  initial: string;
  onOpen(): void;
  onToggle(): void;
}) {
  const done = t.status === "done";
  return (
    <li>
      <div
        className={"nk-magenda-task" + (done ? " is-done" : "")}
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
      >
        <span className={`nk-magenda-avatar priority-${t.priority}`} aria-hidden>
          {initial}
        </span>
        <div className="nk-magenda-task-body">
          <div className="nk-magenda-task-title">{t.title || "Untitled task"}</div>
          <div className="nk-magenda-task-sub">
            {STATUS_WORD[t.status]} · {PRIORITY_WORD[t.priority]}
          </div>
        </div>
        <button
          className={"nk-magenda-check" + (done ? " is-done" : "")}
          aria-label={done ? "Mark as not done" : "Mark as done"}
          aria-pressed={done}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {done ? <Check size={16} aria-hidden /> : <Circle size={18} aria-hidden />}
        </button>
      </div>
    </li>
  );
}
