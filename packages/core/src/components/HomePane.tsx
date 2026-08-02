import { useMemo } from "react";
import { FileText, Pencil, Plus, Zap, CheckSquare } from "lucide-react";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import type { Note } from "../types/note";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface HomePaneProps {
  onNewNote: () => void;
  onNewDrawing: () => void;
  onOpenNote: (id: string) => void;
  onToggleTicket: (id: string) => void;
}

export function HomePane({ onNewNote, onNewDrawing, onOpenNote, onToggleTicket }: HomePaneProps) {
  const notes = useNotesStore((s) => s.notes);
  const tickets = useTicketsStore((s) => s.all());

  const recent = useMemo(() => {
    return (Object.values(notes) as Note[])
      .filter((n) => n.format !== "ink")
      .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
      .slice(0, 6);
  }, [notes]);

  const todayTasks = useMemo(() => {
    const ymd = todayYMD();
    return tickets
      .filter((t) => t.dueDate === ymd && t.status !== "done")
      .slice(0, 6);
  }, [tickets]);

  return (
    <div className="nk-home">
      <div className="nk-home-greeting">
        <h1>{greeting()}</h1>
        <p>{formatDate()}</p>
      </div>

      <div className="nk-home-actions">
        <button className="nk-home-action" onClick={onNewNote}>
          <Plus size={16} aria-hidden />
          New note
        </button>
        <button className="nk-home-action" onClick={onNewDrawing}>
          <Pencil size={16} aria-hidden />
          Drawing
        </button>
      </div>

      {recent.length > 0 && (
        <section className="nk-home-section">
          <h2 className="nk-home-section-title">
            <Zap size={13} aria-hidden />
            Recent
          </h2>
          <ul className="nk-home-list">
            {recent.map((n) => (
              <li key={n.id}>
                <button className="nk-home-row" onClick={() => onOpenNote(n.id)}>
                  <FileText size={14} aria-hidden className="nk-home-row-icon" />
                  <span className="nk-home-row-title">{n.title || "Untitled"}</span>
                  <span className="nk-home-row-meta">{relativeTime(n.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {todayTasks.length > 0 && (
        <section className="nk-home-section">
          <h2 className="nk-home-section-title">
            <CheckSquare size={13} aria-hidden />
            Today
          </h2>
          <ul className="nk-home-list">
            {todayTasks.map((t) => (
              <li key={t.id}>
                <button
                  className="nk-home-row nk-home-row--task"
                  onClick={() => onToggleTicket(t.id)}
                >
                  <span className="nk-home-checkbox" aria-hidden />
                  <span className="nk-home-row-title">{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
