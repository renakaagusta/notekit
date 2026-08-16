import {
  CheckSquare,
  Clock,
  FileText,
  Link as LinkIcon,
  Lock,
  Pencil,
  Plus,
  Search,
  Share2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMediaQuery, MOBILE_BREAKPOINT } from "../hooks/useMediaQuery";
import { noteTitle } from "../lib/note-display";
import { useLinksStore } from "../stores/linksStore";
import { useNotesStore } from "../stores/notesStore";
import { useSyncStore } from "../stores/syncStore";
import { useTicketsStore } from "../stores/ticketsStore";
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

/** A tilted paper sheet — the New note capture illustration. */
function NoteArt() {
  return (
    <svg className="nk-home-cta-art" viewBox="0 0 120 120" aria-hidden fill="none">
      <g transform="rotate(-9 78 82)">
        <rect x="52" y="40" width="58" height="74" rx="8" fill="#fff" />
        <path d="M92 40h18v18z" fill="#d7dae0" />
        <path d="M92 40v18h18" stroke="#c2c6cf" strokeWidth="1.5" />
        <rect x="62" y="66" width="38" height="5" rx="2.5" fill="#c9cdd6" />
        <rect x="62" y="79" width="38" height="5" rx="2.5" fill="#d3d7df" />
        <rect x="62" y="92" width="24" height="5" rx="2.5" fill="#dde0e6" />
      </g>
    </svg>
  );
}

/** A card stack with a checked item — the New task capture illustration. */
function TaskArt() {
  return (
    <svg className="nk-home-cta-art" viewBox="0 0 120 120" aria-hidden fill="none">
      <rect x="58" y="70" width="66" height="30" rx="8" fill="#fff" opacity="0.55" />
      <rect x="48" y="52" width="72" height="34" rx="9" fill="#fff" />
      <circle cx="62" cy="69" r="8" fill="#5b6472" />
      <path d="M58.5 69l2.6 2.6 4.4-4.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="76" y="63" width="34" height="4.5" rx="2.25" fill="#cfd3db" />
      <rect x="76" y="72" width="24" height="4.5" rx="2.25" fill="#dadde3" />
    </svg>
  );
}

type Filter = "all" | "notes" | "tasks" | "links";
interface RecentItem {
  id: string;
  kind: "note" | "task" | "link";
  title: string;
  at: string;
}

interface HomePaneProps {
  onNewNote: () => void;
  onNewDrawing?: () => void;
  onOpenNote: (id: string) => void;
  onToggleTicket: (id: string) => void;
}

/** Placeholder rows shown while E2EE content decrypts (avoids the "Untitled" flash). */
function SkeletonRows({ count }: { count: number }) {
  return (
    <ul className="nk-home-list" aria-hidden>
      {Array.from({ length: Math.min(Math.max(count, 3), 6) }).map((_, i) => (
        <li key={i}>
          <div className="nk-home-row nk-home-row-skeleton">
            <span className="nk-home-row-icon nk-skel-box" />
            <span className="nk-home-row-title nk-skel-line" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// eslint-disable-next-line max-lines-per-function -- React component home screen with multiple sections; splitting would create prop-drilling overhead
export function HomePane({ onNewNote, onNewDrawing, onOpenNote, onToggleTicket }: HomePaneProps) {
  const notes = useNotesStore((s) => s.notes);
  const tickets = useTicketsStore((s) => s.all());
  const links = useLinksStore((s) => s.all());
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const [filter, setFilter] = useState<Filter>("all");

  // Titles are E2EE — note/task/link bodies are stripped from localStorage and
  // only decrypt once content lands (from the local ciphertext cache on a warm
  // boot, or the first network pull otherwise). Until then the persisted records
  // resolve to "Untitled". Show skeleton rows during that window instead of the
  // stale "Untitled" flash. `contentReady` flips as soon as decrypted content is
  // applied; `settled` is a safety net so we never skeleton forever (offline,
  // no account, empty vault).
  const contentReady = useSyncStore((s) => s.contentReady);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 6000);
    return () => clearTimeout(t);
  }, []);
  const contentLoading = !contentReady && !settled;

  const todayTasks = useMemo(() => {
    const ymd = todayYMD();
    return tickets.filter((t) => t.dueDate === ymd && t.status !== "done").slice(0, 4);
  }, [tickets]);

  const recentNotes = useMemo(() => {
    return (Object.values(notes) as Note[])
      .filter((n) => n.format !== "ink")
      .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
      .slice(0, 8);
  }, [notes]);

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

  // ── Desktop: keep the previous simple home (unchanged behavior). ──
  if (!isMobile) {
    return (
      <div className="nk-home nk-home--desktop">
        <div className="nk-home-greeting">
          <h1>{greeting()}</h1>
          <p>{formatDate()}</p>
        </div>

        <div className="nk-home-actions">
          <button className="nk-home-action" onClick={onNewNote}>
            <Plus size={16} aria-hidden />
            New note
          </button>
          {onNewDrawing && (
            <button className="nk-home-action" onClick={onNewDrawing}>
              <Pencil size={16} aria-hidden />
              Drawing
            </button>
          )}
        </div>

        <section className="nk-home-section">
          <h2 className="nk-home-section-title">
            <Zap size={13} aria-hidden />
            Recent
          </h2>
          {contentLoading && recentNotes.length > 0 ? (
            <SkeletonRows count={recentNotes.length} />
          ) : recentNotes.length === 0 ? (
            <p className="nk-home-empty">No notes yet. Create one above.</p>
          ) : (
            <ul className="nk-home-list">
              {recentNotes.map((n) => (
                <li key={n.id}>
                  <button className="nk-home-row" onClick={() => onOpenNote(n.id)}>
                    <span className="nk-home-row-icon">
                      <FileText size={16} aria-hidden />
                    </span>
                    <span className="nk-home-row-title">{noteTitle(n)}</span>
                    <span className="nk-home-row-meta">{relativeTime(n.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="nk-home-section">
          <h2 className="nk-home-section-title">
            <CheckSquare size={13} aria-hidden />
            Today
          </h2>
          {todayTasks.length === 0 ? (
            <p className="nk-home-empty">No tasks due today.</p>
          ) : (
            <ul className="nk-home-list">
              {todayTasks.map((t) => (
                <li key={t.id}>
                  <button className="nk-home-row" onClick={() => onToggleTicket(t.id)}>
                    <span className="nk-home-row-icon">
                      <CheckSquare size={16} aria-hidden />
                    </span>
                    <span className="nk-home-row-title">{t.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  // ── Mobile: the Daymark-style dashboard. ──
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
          <div className="nk-home-greeting-text">
            <h1>{greeting()}</h1>
            <p>{formatDate()}</p>
          </div>
          <button
            className="nk-iconbtn nk-home-search-btn"
            onClick={() => nav("notes")}
            aria-label="Search"
            title="Search notes, tasks, links…"
          >
            <Search size={20} aria-hidden />
          </button>
        </header>

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
              <Plus size={20} aria-hidden /> New note
            </span>
            <NoteArt />
          </button>
          <button className="nk-home-cta nk-home-cta--task" onClick={newTask}>
            <span className="nk-home-cta-lbl">
              <Plus size={20} aria-hidden /> New task
            </span>
            <TaskArt />
          </button>
        </div>

        <div className="nk-home-tiles">
          <button className="nk-home-tile" onClick={() => nav("graph")}>
            <Share2 size={20} aria-hidden />
            <span>Graph</span>
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
          {contentLoading && recent.length > 0 ? (
            <SkeletonRows count={recent.length} />
          ) : recent.length === 0 ? (
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
