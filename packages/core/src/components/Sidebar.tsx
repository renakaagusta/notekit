import { useEffect, useRef, useState } from "react";
import { Bot, Clock, KeyRound, LogOut, MoreHorizontal, Plus } from "lucide-react";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import type { User } from "../types/user";
import { CreateMenu } from "./CreateMenu";
import { NoteList } from "./NoteList";
import { TicketSidebarList } from "./TicketSidebarList";
import { VaultSwitcher } from "./VaultSwitcher";

export type SidebarView = "notes" | "tickets" | "graph" | "calendar" | "secrets" | "links";

interface SidebarProps {
  view: SidebarView;
  onView(v: SidebarView): void;
  user?: User | null;
  onSignOut?: () => void;
  onOpenAgents?: () => void;
  onOpenHistory?: () => void;
  onOpenTokens?: () => void;
}

export function Sidebar({
  view,
  onView,
  user,
  onSignOut,
  onOpenAgents,
  onOpenHistory,
  onOpenTokens,
}: SidebarProps) {
  const upsertTicket = useTicketsStore((s) => s.upsert);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!userMenuRef.current) return;
      if (userMenuRef.current.contains(e.target as Node)) return;
      setUserMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  function onAdd() {
    if (view === "notes") {
      setCreateMenuOpen((v) => !v);
    } else if (view === "tickets") {
      upsertTicket({ title: "New ticket", status: "todo" });
    }
  }

  const heading =
    view === "notes"
      ? "Notes"
      : view === "tickets"
        ? "Tickets"
        : view === "graph"
          ? "Graph"
          : view === "secrets"
            ? "Secrets"
            : view === "links"
              ? "Links"
              : "Calendar";

  return (
    <aside className="nk-sidebar">
      <VaultSwitcher />
      <div className="nk-nav">
        <button
          className={view === "notes" ? "active" : ""}
          onClick={() => onView("notes")}
        >
          Notes
        </button>
        <button
          className={view === "tickets" ? "active" : ""}
          onClick={() => onView("tickets")}
        >
          Tickets
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => onView("calendar")}
        >
          Calendar
        </button>
        <button
          className={view === "graph" ? "active" : ""}
          onClick={() => onView("graph")}
        >
          Graph
        </button>
        <button
          className={view === "secrets" ? "active" : ""}
          onClick={() => onView("secrets")}
        >
          Secrets
        </button>
        <button
          className={view === "links" ? "active" : ""}
          onClick={() => onView("links")}
        >
          Links
        </button>
      </div>

      <div className="nk-sidebar-hd">
        <span>{heading}</span>
        {view !== "graph" && view !== "secrets" && view !== "links" && (
          <span className="nk-sidebar-hd-actions nk-tree-add-wrap">
            <button
              className="nk-iconbtn"
              data-create-toggle={view === "notes" ? "" : undefined}
              onClick={onAdd}
              title={view === "notes" ? "New file or folder" : "New ticket"}
              aria-label="Add"
            >
              <Plus size={14} aria-hidden />
            </button>
            {view === "notes" && createMenuOpen && (
              <CreateMenu
                parent={null}
                onClose={() => setCreateMenuOpen(false)}
              />
            )}
          </span>
        )}
      </div>

      {view === "notes" && <NoteList />}
      {view === "tickets" && <TicketSidebarList />}
      {view === "graph" && (
        <div className="nk-empty">
          <p>Knowledge graph.</p>
          <p className="nk-empty-hint">
            Nodes are notes. Links come from{" "}
            <code style={{ fontFamily: "var(--mono-font)" }}>[[wikilinks]]</code>{" "}
            in your notes.
          </p>
        </div>
      )}
      {view === "calendar" && (
        <div className="nk-empty">
          <p>Daily journals.</p>
          <p className="nk-empty-hint">
            <kbd>⌘</kbd>
            <kbd>'</kbd> opens today.{" "}
            <code style={{ fontFamily: "var(--mono-font)" }}>[[2026-05-16]]</code>{" "}
            links to a date.
          </p>
        </div>
      )}
      {view === "secrets" && (
        <div className="nk-empty">
          <p>Encrypted secrets.</p>
          <p className="nk-empty-hint">
            API keys and tokens, encrypted on-device before they touch the
            vault. Only your devices can read them.
          </p>
        </div>
      )}
      {view === "links" && (
        <div className="nk-empty">
          <p>Saved links.</p>
          <p className="nk-empty-hint">
            Bookmarks with auto-detected platform tags — X, GitHub, YouTube,
            and more.
          </p>
        </div>
      )}

      {user && (
        <div className="nk-userbar" ref={userMenuRef}>
          {user.avatarUrl ? (
            <img className="nk-avatar" src={user.avatarUrl} alt="" />
          ) : (
            <div className="nk-avatar nk-avatar--placeholder">
              {(user.name ?? user.email).slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="nk-userbar-meta">
            <div className="nk-userbar-name">{user.name ?? user.email}</div>
            <div className="nk-userbar-plan">{user.plan}</div>
          </div>
          <button
            className="nk-iconbtn"
            onClick={() => setUserMenuOpen((v) => !v)}
            title="Account menu"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
          >
            <MoreHorizontal size={14} aria-hidden />
          </button>
          {userMenuOpen && (
            <div className="nk-popover nk-popover--userbar" role="menu">
              {onOpenHistory && (
                <button
                  className="nk-popover-item"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenHistory();
                  }}
                >
                  <Clock size={14} aria-hidden />
                  <span>Activity</span>
                </button>
              )}
              {onOpenAgents && (
                <button
                  className="nk-popover-item"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenAgents();
                  }}
                >
                  <Bot size={14} aria-hidden />
                  <span>Manage agents</span>
                </button>
              )}
              {onOpenTokens && (
                <button
                  className="nk-popover-item"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenTokens();
                  }}
                >
                  <KeyRound size={14} aria-hidden />
                  <span>API tokens</span>
                </button>
              )}
              {onSignOut && (
                <button
                  className="nk-popover-item"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onSignOut();
                  }}
                >
                  <LogOut size={14} aria-hidden />
                  <span>Sign out</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
