import { useMemo, useState } from "react";
import {
  Calendar,
  CheckSquare,
  Clock,
  FileText,
  Link as LinkIcon,
  Lock,
  Plus,
  Search,
} from "lucide-react";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { useLinksStore } from "../stores/linksStore";
import { noteTitle } from "../lib/note-display";
import type { Note } from "../types/note";

/** Mirror of App's MainView — the surfaces the home tiles can navigate to. */
type MainView = "notes" | "tickets" | "graph" | "calendar" | "secrets" | "links";

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
    year: "numeric",
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Navigate a surface via the App-level bridge (no prop threading). */
function nav(view: MainView) {
  window.dispatchEvent(new CustomEvent("nk:home-nav", { detail: { view } }));
}

type Filter = "all" | "notes" | "tasks" | "links";
type RecentItem = {
  id: string;
  kind: "note" | "task" | "link";
  title: string;
  at: string;
};

interface HomePaneProps {
  onNewNote: () => void;
  onNewDrawing?: () => void;
  onOpenNote: (id: string) => void;
  onToggleTicket: (id: string) => void;
}

export function HomePane({ onNewNote, onOpenNote, onToggleTicket }: HomePaneProps) {
  const notes = useNotesStore((s) => s.notes);
  const tickets = useTicketsStore((s) => s.all());
  const links = useLinksStore((s) => s.all());
  const [filter, setFilter] = useState<Filter>("all");

  const todayTasks = useMemo(() => {
    const ymd = todayYMD();
    return tickets.filter((t) => t.dueDate === ymd && t.status !== "done").slice(0, 4);
  }, [tickets]);

  const recent = useMemo<RecentItem[]>(() => {
    const noteItems: RecentItem[] = (Object.values(notes) as Note[])
      .filter((n) => n.format !== "ink")
      .map((n) => ({ id: n.id, kind: "note", title: noteTitle(n), at: n.updatedAt }));
    const taskItems: RecentItem[] = tickets.map((t) => ({
      id: t.id,
      kind: "task",
      title: t.title || "Untitled task",
      at: t.updatedAt,
    }));
    const linkItems: RecentItem[] = links.map((l) => ({
      id: l.id,
      kind: "link",
      title: l.title || l.url,
      at: l.updatedAt,
    }));
    const all = [...noteItems, ...taskItems, ...linkItems];
    const filtered =
      filter === "all"
        ? all
        : all.filter((x) =>
            filter === "notes" ? x.kind === "note" : filter === "tasks" ? x.kind === "task" : x.kind === "link",
          );
    return filtered.sort((a, b) => (b.at > a.at ? 1 : -1)).slice(0, 6);
  }, [notes, tickets, links, filter]);

  function newTask() {
    useTicketsStore.getState().upsert({ title: "New task", status: "todo" });
    nav("tickets");
  }

  function openRecent(item: RecentItem) {
    if (item.kind === "note") onOpenNote(item.id);
    else if (item.kind === "task") nav("tickets");
    else nav("links");
  }

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "notes", label: "Notes" },
    { key: "tasks", label: "Tasks" },
    { key: "links", label: "Links" },
  ];

  return (
    <div className="nk-home">
      <div className="nk-home-inner">
        <header className="nk-home-greeting">
          <h1>{greeting()}</h1>
          <p>{formatDate()}</p>
        </header>

        <button className="nk-home-search" onClick={() => nav("notes")}>
          <Search size={18} aria-hidden />
          <span>Search notes, tasks, links…</span>
        </button>

        {todayTasks.length > 0 && (
          <section className="nk-home-today">
            <div className="nk-home-today-hd">
              <h2>Today</h2>
              <span className="nk-home-today-count">
                {todayTasks.length} {todayTasks.length === 1 ? "item" : "items"}
              </span>
            </div>
            <ul className="nk-home-agenda">
              {todayTasks.map((t) => (
                <li key={t.id}>
                  <button
                    className="nk-home-agenda-row"
                    onClick={() => onToggleTicket(t.id)}
                    title="Mark done"
                  >
                    <span className="nk-home-agenda-ico">
                      <CheckSquare size={16} aria-hidden />
                    </span>
                    <span className="nk-home-agenda-title">{t.title}</span>
                    <span className="nk-home-agenda-tag">Task</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="nk-home-cta-row">
          <button className="nk-home-cta nk-home-cta--note" onClick={onNewNote}>
            <span className="nk-home-cta-lbl">
              <Plus size={19} aria-hidden /> New note
            </span>
            <FileText className="nk-home-cta-glyph" size={72} aria-hidden />
          </button>
          <button className="nk-home-cta nk-home-cta--task" onClick={newTask}>
            <span className="nk-home-cta-lbl">
              <Plus size={19} aria-hidden /> New task
            </span>
            <CheckSquare className="nk-home-cta-glyph" size={72} aria-hidden />
          </button>
        </div>

        <div className="nk-home-tiles">
          <button className="nk-home-tile" onClick={() => nav("calendar")}>
            <Calendar size={20} aria-hidden />
            <span>Calendar</span>
          </button>
          <button className="nk-home-tile" onClick={() => nav("links")}>
            <LinkIcon size={20} aria-hidden />
            <span>Links</span>
          </button>
          <button className="nk-home-tile nk-home-tile--secret" onClick={() => nav("secrets")}>
            <Lock size={20} aria-hidden />
            <span>Secrets</span>
          </button>
        </div>

        <section className="nk-home-section">
          <div className="nk-home-recent-hd">
            <h2 className="nk-home-section-title">
              <Clock size={13} aria-hidden />
              Recent
            </h2>
            <div className="nk-home-chips">
              {chips.map((c) => (
                <button
                  key={c.key}
                  className={`nk-home-chip${filter === c.key ? " is-on" : ""}`}
                  onClick={() => setFilter(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {recent.length === 0 ? (
            <p className="nk-home-empty">Nothing here yet.</p>
          ) : (
            <ul className="nk-home-list">
              {recent.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button className="nk-home-row" onClick={() => openRecent(item)}>
                    <span className="nk-home-row-icon">
                      {item.kind === "note" ? (
                        <FileText size={16} aria-hidden />
                      ) : item.kind === "task" ? (
                        <CheckSquare size={16} aria-hidden />
                      ) : (
                        <LinkIcon size={16} aria-hidden />
                      )}
                    </span>
                    <span className="nk-home-row-title">{item.title}</span>
                    <span className="nk-home-row-meta">{relativeTime(item.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
