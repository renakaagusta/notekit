import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Bot,
  Calendar as CalendarIcon,
  ChevronDown,
  Clock,
  KeyRound,
  Link2,
  LogOut,
  Menu,
  MoreHorizontal,
  Network,
  Plus,
  Search,
  Shield,
} from "lucide-react";
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
  onOpenNotifications?: () => void;
  /**
   * When provided, the section header renders a search icon next to the
   * "+" button. Used by the mobile shell where no ⌘K shortcut is reachable.
   */
  onOpenSearch?: () => void;
  /**
   * When provided, the section header renders a hamburger icon on the left
   * that opens the global mobile drawer (vault picker + all surfaces).
   */
  onOpenMenu?: () => void;
}

export function Sidebar({
  view,
  onView,
  user,
  onSignOut,
  onOpenAgents,
  onOpenHistory,
  onOpenTokens,
  onOpenNotifications,
  onOpenSearch,
  onOpenMenu,
}: SidebarProps) {
  const upsertTicket = useTicketsStore((s) => s.upsert);
  // Counts for the section header badge. Subscribes to the count
  // (cheap primitive equality) rather than the array (would re-render
  // every keystroke). The all() selector already exists in both stores.
  const notesCount = useNotesStore((s) => s.all().length);
  const ticketsCount = useTicketsStore((s) => s.all().length);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

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

  // Same outside-click pattern for the More popover so the nav stays a
  // single-active-element row at any time.
  useEffect(() => {
    if (!moreMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!moreMenuRef.current) return;
      if (moreMenuRef.current.contains(e.target as Node)) return;
      setMoreMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreMenuOpen]);

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
      {/* Primary tabs only — Notes and Tickets are the daily-use surfaces
       * named in the product tagline ("Notes & tickets in your Git repo").
       * The four secondary surfaces (Calendar, Graph, Secrets, Links)
       * moved into a "More" popover to stop clipping at 240px width and
       * to keep the chrome quiet for the 80% case. */}
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
        <div className="nk-nav-more-wrap" ref={moreMenuRef}>
          <button
            className={
              "nk-nav-more " +
              (view === "calendar" ||
              view === "graph" ||
              view === "secrets" ||
              view === "links"
                ? "active"
                : "")
            }
            onClick={() => setMoreMenuOpen((v) => !v)}
            title="More views"
            aria-label="More views"
            aria-haspopup="menu"
            aria-expanded={moreMenuOpen}
          >
            More
            <ChevronDown size={11} aria-hidden />
          </button>
          {moreMenuOpen && (
            <div className="nk-popover nk-popover--nav-more" role="menu">
              <button
                className="nk-popover-item"
                role="menuitem"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onView("calendar");
                }}
              >
                <CalendarIcon size={14} aria-hidden />
                <span>Calendar</span>
              </button>
              <button
                className="nk-popover-item"
                role="menuitem"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onView("graph");
                }}
              >
                <Network size={14} aria-hidden />
                <span>Graph</span>
              </button>
              <button
                className="nk-popover-item"
                role="menuitem"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onView("links");
                }}
              >
                <Link2 size={14} aria-hidden />
                <span>Links</span>
              </button>
              <button
                className="nk-popover-item"
                role="menuitem"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onView("secrets");
                }}
              >
                <Shield size={14} aria-hidden />
                <span>Secrets</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="nk-sidebar-hd">
        {onOpenMenu && (
          <button
            className="nk-iconbtn nk-sidebar-menu"
            onClick={onOpenMenu}
            title="Menu"
            aria-label="Open menu"
          >
            <Menu size={16} aria-hidden />
          </button>
        )}
        <span>
          {heading}
          {view === "notes" && notesCount > 0 && (
            <span className="nk-sidebar-count">{notesCount}</span>
          )}
          {view === "tickets" && ticketsCount > 0 && (
            <span className="nk-sidebar-count">{ticketsCount}</span>
          )}
        </span>
        <span className="nk-sidebar-hd-actions nk-tree-add-wrap">
          {onOpenSearch && (
            <button
              className="nk-iconbtn nk-sidebar-search"
              onClick={onOpenSearch}
              title="Search (⌘K)"
              aria-label="Search"
            >
              <Search size={14} aria-hidden />
            </button>
          )}
          {view !== "graph" && view !== "secrets" && view !== "links" && (
            <>
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
            </>
          )}
        </span>
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
              {onOpenNotifications && (
                <button
                  className="nk-popover-item"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenNotifications();
                  }}
                >
                  <Bell size={14} aria-hidden />
                  <span>Notifications</span>
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
