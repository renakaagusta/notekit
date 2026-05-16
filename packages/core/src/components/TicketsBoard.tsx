import { useEffect, useRef } from "react";
import { useTicketsStore } from "../stores/ticketsStore";
import type { Ticket, TicketStatus, TicketPriority } from "../types/ticket";

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

  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

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

  return (
    <div className="nk-board">
      {COLUMNS.map((col) => {
        const cards = all.filter((t) => t.status === col.status);
        return (
          <section key={col.status} className="nk-col">
            <header className="nk-col-hd">
              <span>
                <span className={`status-dot ${col.dot}`} aria-hidden />
                {col.label}
              </span>
              <span className="count">{cards.length}</span>
            </header>
            <div className="nk-col-body">
              {cards.map((t) => (
                <article
                  key={t.id}
                  className="nk-card"
                  ref={(el) => {
                    if (el) cardRefs.current.set(t.id, el);
                    else cardRefs.current.delete(t.id);
                  }}
                >
                  <div className="meta">
                    <span className="id">{t.id.slice(0, 6)}</span>
                    <span className={`nk-chip ${PRIORITY_CLASS[t.priority]}`}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  </div>
                  <div
                    className="title"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const next = e.currentTarget.textContent?.trim();
                      if (next && next !== t.title) {
                        upsert({ ...t, title: next });
                      }
                    }}
                  >
                    {t.title}
                  </div>
                  <div className="nk-card-foot">
                    <button
                      className="nk-iconbtn"
                      onClick={() => cycleStatus(t)}
                      title="Advance status"
                      aria-label="Advance status"
                    >
                      →
                    </button>
                    {t.labels.length > 0 && (
                      <span className="labels">
                        {t.labels.map((l) => (
                          <span key={l} className="nk-chip">
                            {l}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </article>
              ))}
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
  );
}
