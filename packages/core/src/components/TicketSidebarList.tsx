import { useTicketsStore } from "../stores/ticketsStore";
import type { TicketStatus } from "../types/ticket";

const STATUS_DOT: Record<TicketStatus, string> = {
  todo: "status-todo",
  in_progress: "status-progress",
  blocked: "status-blocked",
  done: "status-done",
  archived: "status-canceled",
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
    <ul className="nk-tree">
      {tickets.map((t) => (
        <li key={t.id} className="nk-tree-item">
          <span
            className={`status-dot ${STATUS_DOT[t.status]}`}
            aria-hidden
            style={{ width: 8, height: 8, flexShrink: 0 }}
          />
          <span className="nk-tree-label">{t.title}</span>
        </li>
      ))}
    </ul>
  );
}
