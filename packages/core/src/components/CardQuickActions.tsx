import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Ticket, TicketPriority } from "../types/ticket";

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: "urgent", label: "P0 · Urgent" },
  { value: "high", label: "P1 · High" },
  { value: "medium", label: "P2 · Medium" },
  { value: "low", label: "P3 · Low" },
];

interface CardQuickActionsProps {
  ticket: Ticket;
  onPriority(p: TicketPriority): void;
  onDueDate(ymd: string | null): void;
  onDelete(): void;
}

export function CardQuickActions({
  ticket,
  onPriority,
  onDueDate,
  onDelete,
}: CardQuickActionsProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleDelete() {
    if (confirm(`Delete "${ticket.title}"? This removes the file from the vault.`)) {
      onDelete();
      setOpen(false);
    }
  }

  return (
    <div className="nk-qa" ref={wrapRef}>
      <button
        type="button"
        className="nk-iconbtn nk-qa-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>

      {open && (
        <div className="nk-qa-menu" role="menu">
          <div className="nk-qa-section">
            <div className="nk-qa-section-title">Priority</div>
            <div className="nk-qa-priority-row">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={
                    "nk-qa-priority-btn priority-" +
                    p.value +
                    (ticket.priority === p.value ? " is-selected" : "")
                  }
                  onClick={() => {
                    onPriority(p.value);
                    setOpen(false);
                  }}
                  title={p.label}
                >
                  {p.label.split(" · ")[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="nk-qa-section">
            <div className="nk-qa-section-title">Due date</div>
            <div className="nk-qa-due-row">
              <input
                type="date"
                className="nk-input"
                value={ticket.dueDate ?? ""}
                onChange={(e) => onDueDate(e.target.value || null)}
              />
              {ticket.dueDate && (
                <button
                  type="button"
                  className="nk-qa-clear"
                  onClick={() => onDueDate(null)}
                  title="Clear due date"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            className="nk-qa-danger"
            onClick={handleDelete}
            role="menuitem"
          >
            Delete ticket
          </button>
        </div>
      )}
    </div>
  );
}
