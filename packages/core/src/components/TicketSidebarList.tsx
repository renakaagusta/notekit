import { useTicketsStore } from "../stores/ticketsStore";
import type { TicketPriority, TicketStatus } from "../types/ticket";

const STATUS_DOT: Record<TicketStatus, string> = {
  todo: "status-todo",
  in_progress: "status-progress",
  blocked: "status-blocked",
  done: "status-done",
  archived: "status-canceled",
};

const STATUS_LABEL: Record<TicketStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  archived: "Archived",
};

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  urgent: "P0",
  high: "P1",
  medium: "P2",
  low: "P3",
};

export function TicketSidebarList() {
  const tickets = useTicketsStore((s) => s.all());

  if (tickets.length === 0) {
    return (
      <div className="nk-empty">
        <p>No tickets yet.</p>
        <p className="nk-empty-hint">Press + above to create one.</p>
      </div>
    );
  }

  return (
    <ul className="nk-tree nk-ticket-list">
      {tickets.map((t) => (
        <li key={t.id} className="nk-tree-item nk-ticket-row">
          <div className="nk-ticket-row-top">
            <span
              className={`status-dot ${STATUS_DOT[t.status]}`}
              aria-label={STATUS_LABEL[t.status]}
              title={STATUS_LABEL[t.status]}
            />
            <span className="nk-ticket-row-title">{t.title}</span>
            <span
              className={`nk-ticket-row-prio prio-${t.priority}`}
              aria-label={`Priority ${PRIORITY_LABEL[t.priority]}`}
            >
              {PRIORITY_LABEL[t.priority]}
            </span>
          </div>
          {(t.labels.length > 0 || t.assignee) && (
            <div className="nk-ticket-row-meta">
              {t.labels.slice(0, 3).map((l) => (
                <span key={l} className="nk-ticket-row-label">
                  {l}
                </span>
              ))}
              {t.assignee && (
                <span className="nk-ticket-row-assignee">{t.assignee}</span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
