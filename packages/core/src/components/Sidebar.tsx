import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Bell,
  Bot,
  Calendar as CalendarIcon,
  Clock,
  FileText,
  KeyRound,
  Link2,
  LogOut,
  Menu,
  MonitorSmartphone,
  MoreHorizontal,
  Network,
  PanelLeft,
  Plus,
  Search,
  Shield,
  SquareKanban,
} from "lucide-react";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import type { User } from "../types/user";
import { CreateMenu } from "./CreateMenu";
import { NoteList } from "./NoteList";
import { TicketSidebarList } from "./TicketSidebarList";
import { VaultSwitcher } from "./VaultSwitcher";
import { NotekitIcon } from "./BrandIcons";

export type SidebarView = "notes" | "tickets" | "graph" | "calendar" | "secrets" | "links";

/**
 * Primary nav, rendered as a flat vertical list (Notion / Linear / Orca
 * style) so every surface is one click away — no "More" dropdown to clip
 * at 240px. Notes and Tickets are the browsing surfaces (they show a list
 * below) and carry a count badge + a contextual "+"; the rest are
 * destination views that take over the main pane.
 */
const NAV: {
  view: SidebarView;
  label: string;
  Icon: typeof FileText;
}[] = [
  { view: "notes", label: "Notes", Icon: FileText },
  { view: "tickets", label: "Tickets", Icon: SquareKanban },
  { view: "calendar", label: "Calendar", Icon: CalendarIcon },
  { view: "graph", label: "Graph", Icon: Network },
  { view: "links", label: "Links", Icon: Link2 },
  { view: "secrets", label: "Secrets", Icon: Shield },
];

interface SidebarProps {
  view: SidebarView;
  onView(v: SidebarView): void;
  user?: User | null;
  onSignOut?: () => void;
  onOpenAgents?: () => void;
  onOpenHistory?: () => void;
  onOpenTokens?: () => void;
  onOpenDevices?: () => void;
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
  /**
   * When provided (desktop only), the brand row renders a collapse button
   * that hides the whole sidebar.
   */
  onCollapse?: () => void;
}

const NAV_HEIGHT_KEY = "nk:sidebar-nav-h";

export function Sidebar({
  view,
  onView,
  user,
  onSignOut,
  onOpenAgents,
  onOpenHistory,
  onOpenTokens,
  onOpenDevices,
  onOpenNotifications,
  onOpenSearch,
  onOpenMenu,
  onCollapse,
}: SidebarProps) {
  const upsertTicket = useTicketsStore((s) => s.upsert);
  // Counts for the section header badge. Subscribes to the count
  // (cheap primitive equality) rather than the array (would re-render
  // every keystroke). The all() selector already exists in both stores.
  const notesCount = useNotesStore((s) => s.all().length);
  const ticketsCount = useTicketsStore((s) => s.all().length);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // The mobile shell passes onOpenMenu (hamburger → drawer). We use its
  // presence to anchor the create menu to the right "+" for the breakpoint:
  // the vertical nav row on desktop, the section-header button on mobile.
  const mobileShell = !!onOpenMenu;

  // Draggable splitter between the surface nav and the list below it. null
  // = natural (content) height; a number pins it and the nav scrolls. The
  // list (flex:1) takes whatever's left.
  const asideRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [navHeight, setNavHeight] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem(NAV_HEIGHT_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : null;
  });

  function onResizeStart(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const pointerId = e.pointerId;
    const handle = e.currentTarget;
    const navTop = navRef.current?.getBoundingClientRect().top ?? 0;
    const asideRect = asideRef.current?.getBoundingClientRect();
    // Reserve room for the footer cluster + a minimum list height so the
    // nav can never swallow the whole sidebar.
    const maxBottom = asideRect ? asideRect.bottom - 220 : navTop + 480;
    handle.setPointerCapture(pointerId);

    function onMove(ev: PointerEvent) {
      const next = Math.max(96, Math.min(ev.clientY - navTop, maxBottom - navTop));
      setNavHeight(next);
    }
    function onUp() {
      handle.releasePointerCapture(pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      setNavHeight((h) => {
        if (h != null) localStorage.setItem(NAV_HEIGHT_KEY, String(Math.round(h)));
        return h;
      });
    }
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  // Double-click the splitter to reset back to the natural height.
  function onResizeReset() {
    setNavHeight(null);
    localStorage.removeItem(NAV_HEIGHT_KEY);
  }

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

  // The "+" on a nav row both switches to that surface and starts a create.
  function onNavAdd(target: "notes" | "tickets") {
    if (target === "notes") {
      if (view !== "notes") onView("notes");
      setCreateMenuOpen((v) => !v);
    } else {
      if (view !== "tickets") onView("tickets");
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
    <aside className="nk-sidebar" ref={asideRef}>
      {/* Brand anchors the top-left as the app identity. The vault switcher
       * (a control, not chrome) moved to the footer next to the account,
       * forming a coherent workspace+account cluster. */}
      <div className="nk-brand">
        <NotekitIcon size={18} className="nk-brand-mark" />
        <span className="nk-brand-word">NoteKit</span>
        {onCollapse && (
          <button
            className="nk-iconbtn nk-brand-collapse"
            onClick={onCollapse}
            title="Hide sidebar"
            aria-label="Hide sidebar"
          >
            <PanelLeft size={15} aria-hidden />
          </button>
        )}
      </div>
      {/* Flat vertical nav — every surface one click away. Notes/Tickets
       * carry a count + a contextual "+"; the rest are destination views.
       * Hidden on mobile (the drawer takes over) via the .nk-nav rule. */}
      <nav
        className="nk-nav"
        aria-label="Surfaces"
        ref={navRef}
        style={navHeight != null ? { height: navHeight } : undefined}
        data-resized={navHeight != null ? "" : undefined}
      >
        {NAV.map(({ view: v, label, Icon }) => {
          const active = view === v;
          const count =
            v === "notes" ? notesCount : v === "tickets" ? ticketsCount : 0;
          const canAdd = v === "notes" || v === "tickets";
          return (
            <div
              key={v}
              className={"nk-navitem-row" + (active ? " active" : "")}
            >
              <button
                className="nk-navitem"
                onClick={() => onView(v)}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={15} className="nk-navitem-icon" aria-hidden />
                <span className="nk-navitem-label">{label}</span>
                {count > 0 && <span className="nk-sidebar-count">{count}</span>}
              </button>
              {canAdd && (
                <button
                  className="nk-iconbtn nk-navitem-add"
                  data-create-toggle={v === "notes" ? "" : undefined}
                  onClick={() => onNavAdd(v)}
                  title={
                    v === "notes" ? "New file or folder (⌘N)" : "New ticket"
                  }
                  aria-label={v === "notes" ? "New note" : "New ticket"}
                >
                  <Plus size={14} aria-hidden />
                </button>
              )}
              {v === "notes" && !mobileShell && createMenuOpen && (
                <CreateMenu
                  parent={null}
                  onClose={() => setCreateMenuOpen(false)}
                />
              )}
            </div>
          );
        })}
      </nav>

      {/* Drag to resize the nav block vs the list below; double-click to
       * reset. Hidden on mobile (the nav is hidden there). */}
      <div
        className="nk-nav-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize navigation"
        onPointerDown={onResizeStart}
        onDoubleClick={onResizeReset}
      >
        <span className="nk-nav-resizer-grip" aria-hidden />
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
              title="Search (⌘K or ⌘P)"
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
                title={
                  view === "notes"
                    ? "New file or folder (⌘N for note)"
                    : "New ticket"
                }
                aria-label="Add"
              >
                <Plus size={14} aria-hidden />
              </button>
              {view === "notes" && mobileShell && createMenuOpen && (
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

      <VaultSwitcher className="nk-vault-switcher--footer" />

      {user && (
        <div className="nk-userbar" ref={userMenuRef}>
          {/* The whole userbar is one button so users can click the
           * avatar or name to open the menu — previously only the
           * tiny ⋯ at the right edge was the target, which was a
           * real daily papercut (users naturally click the avatar).
           * MoreHorizontal stays as a visual affordance hint inside
           * the button. */}
          <button
            type="button"
            className="nk-userbar-trigger"
            onClick={() => setUserMenuOpen((v) => !v)}
            title="Account menu"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
          >
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
            <MoreHorizontal
              size={14}
              aria-hidden
              className="nk-userbar-chev"
            />
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
              {onOpenDevices && (
                <button
                  className="nk-popover-item"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenDevices();
                  }}
                >
                  <MonitorSmartphone size={14} aria-hidden />
                  <span>Devices</span>
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
