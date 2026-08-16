import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  Bookmark,
  Bot,
  Calendar as CalendarIcon,
  Clock,
  FileText,
  KeyRound,
  Link2,
  LogOut,
  Menu,
  Monitor,
  MonitorSmartphone,
  Moon,
  Network,
  PanelLeft,
  Plus,
  Search,
  Shield,
  Sun,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { LOCALES, setLocale } from "../i18n";
import { useNotesStore } from "../stores/notesStore";
import { useVaultStore } from "../stores/vaultStore";
import * as vaultApi from "../lib/vault-api";
import type { User } from "../types/user";
import { CreateMenu } from "./CreateMenu";
import { NoteList } from "./NoteList";
import { SecretsView } from "./SecretsView";
import { LinksView } from "./LinksView";
import { EncryptedSkippedBanner } from "./EncryptedSkippedBanner";
import { VaultSwitcher } from "./VaultSwitcher";
import { NotekitIcon } from "./BrandIcons";

export type SidebarView = "home" | "notes" | "tickets" | "graph" | "calendar" | "secrets" | "links";

const NAV: {
  view: SidebarView;
  label: string;
  Icon: typeof FileText;
}[] = [
  { view: "notes", label: "Notes", Icon: FileText },
  { view: "calendar", label: "Tasks", Icon: CalendarIcon },
  { view: "graph", label: "Graph", Icon: Network },
  { view: "links", label: "Links", Icon: Link2 },
  { view: "secrets", label: "Secrets", Icon: Shield },
];

interface SidebarProps {
  view: SidebarView;
  // The surface the user last selected from the rail. Distinct from `view`
  // because Graph/Tasks render as tabs in the notes pane (they set view="notes"),
  // so `view` can't tell the rail which icon to light — this can.
  railSurface: SidebarView;
  onView(v: SidebarView): void;
  user?: User | null;
  onSignOut?: () => void;
  onOpenAgents?: () => void;
  onOpenHistory?: () => void;
  onOpenTokens?: () => void;
  onOpenDevices?: () => void;
  onOpenNotifications?: () => void;
  onOpenSearch?: () => void;
  onOpenMenu?: () => void;
  onCollapse?: () => void;
  onOpenSecret?: () => void;
  onOpenLink?: () => void;
}

// eslint-disable-next-line complexity, max-lines-per-function -- sidebar dispatches across multiple views, mobile/desktop shell, and user menu state
export function Sidebar({
  view,
  railSurface,
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
  onOpenSecret,
  onOpenLink,
}: SidebarProps) {
  const { i18n } = useTranslation();
  const notesCount = useNotesStore((s) => s.all().length);
  const vaultReady = useVaultStore((s) => s.phase === "ready");
  const activeVaultId = useVaultStore((s) => s.activeId);
  const activeSettings = useVaultStore((s) => s.activeSettings);
  const setActiveSettings = useVaultStore((s) => s.setActiveSettings);

  async function setTheme(theme: "light" | "dark" | "auto") {
    if (!activeVaultId || !activeSettings) return;
    const updated = { ...activeSettings, theme };
    setActiveSettings(updated);
    await vaultApi.patchVaultSettings(activeVaultId, updated).catch(() => { /* intentional noop — best-effort persist */ });
  }
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileShell = !!onOpenMenu;

  useEffect(() => {
    if (!userMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (avatarBtnRef.current?.contains(t)) return;
      if (userMenuRef.current?.contains(t)) return;
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

  function toggleUserMenu() {
    if (!userMenuOpen && avatarBtnRef.current) {
      const r = avatarBtnRef.current.getBoundingClientRect();
      setMenuPos({ x: r.right + 6, y: r.top });
    }
    setUserMenuOpen((v) => !v);
  }

  function onAdd() {
    if (view === "notes") setCreateMenuOpen((v) => !v);
  }

  const heading =
    view === "notes"
      ? "Notes"
      : view === "graph"
          ? "Graph"
          : view === "secrets"
            ? "Secrets"
            : view === "links"
              ? "Links"
              : "Tasks";

  return (
    <aside className="nk-sidebar">
      {/* ── Icon Rail (desktop only) ──────────────────────────────
       * 40px narrow column: brand mark → nav icons → avatar.
       * Hidden on mobile — the drawer handles navigation there.
       * ──────────────────────────────────────────────────────── */}
      <div className="nk-icon-rail">
        <div className="nk-rail-brand">
          <NotekitIcon size={18} />
        </div>

        <nav className="nk-rail-nav" aria-label="Surfaces">
          {NAV.map(({ view: v, label, Icon }) => {
            const active = railSurface === v;
            return (
              <button
                key={v}
                className={"nk-rail-item" + (active ? " active" : "")}
                onClick={() => onView(v)}
                title={label}
                aria-label={label}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={18} aria-hidden />
              </button>
            );
          })}
        </nav>

        <div className="nk-rail-foot">
          {user && (
            <>
              <button
                ref={avatarBtnRef}
                type="button"
                className="nk-rail-avatar-btn"
                onClick={toggleUserMenu}
                title={user.name ?? user.email}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
              >
                {user.avatarUrl ? (
                  <img className="nk-avatar nk-avatar--sm" src={user.avatarUrl} alt="" />
                ) : (
                  <div className="nk-avatar nk-avatar--sm nk-avatar--placeholder">
                    {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                  </div>
                )}
              </button>
              {userMenuOpen && menuPos && createPortal(
                <div
                  ref={userMenuRef}
                  className="nk-popover"
                  role="menu"
                  style={{ position: "fixed", left: menuPos.x, top: menuPos.y, right: "auto", minWidth: 180, zIndex: 9999, transform: "translateY(-100%)" }}
                >
                  {onOpenHistory && (
                    <button
                      className="nk-popover-item"
                      role="menuitem"
                      onClick={() => { setUserMenuOpen(false); onOpenHistory(); }}
                    >
                      <Clock size={14} aria-hidden />
                      <span>Activity</span>
                    </button>
                  )}
                  {onOpenAgents && (
                    <button
                      className="nk-popover-item"
                      role="menuitem"
                      onClick={() => { setUserMenuOpen(false); onOpenAgents(); }}
                    >
                      <Bot size={14} aria-hidden />
                      <span>Manage agents</span>
                    </button>
                  )}
                  {onOpenNotifications && (
                    <button
                      className="nk-popover-item"
                      role="menuitem"
                      onClick={() => { setUserMenuOpen(false); onOpenNotifications(); }}
                    >
                      <Bell size={14} aria-hidden />
                      <span>Notifications</span>
                    </button>
                  )}
                  {onOpenTokens && (
                    <button
                      className="nk-popover-item"
                      role="menuitem"
                      onClick={() => { setUserMenuOpen(false); onOpenTokens(); }}
                    >
                      <KeyRound size={14} aria-hidden />
                      <span>API tokens</span>
                    </button>
                  )}
                  {onOpenDevices && (
                    <button
                      className="nk-popover-item"
                      role="menuitem"
                      onClick={() => { setUserMenuOpen(false); onOpenDevices(); }}
                    >
                      <MonitorSmartphone size={14} aria-hidden />
                      <span>Devices</span>
                    </button>
                  )}
                  {activeSettings && (
                    <div className="nk-popover-theme-row" role="group" aria-label="Theme">
                      <button
                        className={`nk-popover-theme-btn${activeSettings.theme === "light" ? " is-active" : ""}`}
                        onClick={() => setTheme("light")}
                        title="Light"
                        aria-label="Light mode"
                      >
                        <Sun size={13} aria-hidden />
                        <span>Light</span>
                      </button>
                      <button
                        className={`nk-popover-theme-btn${activeSettings.theme === "dark" ? " is-active" : ""}`}
                        onClick={() => setTheme("dark")}
                        title="Dark"
                        aria-label="Dark mode"
                      >
                        <Moon size={13} aria-hidden />
                        <span>Dark</span>
                      </button>
                      <button
                        className={`nk-popover-theme-btn${activeSettings.theme === "auto" ? " is-active" : ""}`}
                        onClick={() => setTheme("auto")}
                        title="System"
                        aria-label="Follow system"
                      >
                        <Monitor size={13} aria-hidden />
                        <span>System</span>
                      </button>
                    </div>
                  )}
                  <div className="nk-popover-theme-row" role="group" aria-label="Language">
                    {LOCALES.map((l) => (
                      <button
                        key={l.code}
                        className={`nk-popover-theme-btn${i18n.language === l.code ? " is-active" : ""}`}
                        onClick={() => setLocale(l.code)}
                        title={l.label}
                        aria-label={l.label}
                      >
                        <span>{l.code.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                  {onSignOut && (
                    <button
                      className="nk-popover-item"
                      role="menuitem"
                      onClick={() => { setUserMenuOpen(false); onSignOut(); }}
                    >
                      <LogOut size={14} aria-hidden />
                      <span>Sign out</span>
                    </button>
                  )}
                </div>,
                document.body
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Content Panel ─────────────────────────────────────────
       * Right column: section header + list + vault switcher.
       * On mobile this fills the full sidebar width (icon rail
       * is hidden) and shows a hamburger/search/add header.
       * ──────────────────────────────────────────────────────── */}
      <div className="nk-panel">
        {mobileShell ? (
          /* Mobile header: hamburger ← title → search + add */
          <div className="nk-sidebar-hd">
            <button
              className="nk-iconbtn nk-sidebar-menu"
              onClick={onOpenMenu}
              title="Menu"
              aria-label="Open menu"
            >
              <Menu size={16} aria-hidden />
            </button>
            <span>
              {heading}
              {view === "notes" && notesCount > 0 && (
                <span className="nk-sidebar-count">{notesCount}</span>
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
              {view === "notes" && vaultReady && (
                <>
                  <button
                    className="nk-iconbtn"
                    data-create-toggle=""
                    onClick={onAdd}
                    title="New file or folder (⌘N for note)"
                    aria-label="Add"
                  >
                    <Plus size={14} aria-hidden />
                  </button>
                  {createMenuOpen && (
                    <CreateMenu
                      parent={null}
                      onClose={() => setCreateMenuOpen(false)}
                    />
                  )}
                </>
              )}
            </span>
          </div>
        ) : (
          /* Desktop panel header — Obsidian-style Row 1:
           * [Files] [Search] [Bookmark/Links]  ···  [⊡ collapse]
           * Active icon gets a background chip; collapse sits at the far right. */
          <div className="nk-panel-hd">
            <div className="nk-panel-nav">
              <button
                className={"nk-panel-nav-btn" + (view === "notes" ? " active" : "")}
                onClick={() => onView("notes")}
                title="Notes"
                aria-label="Notes"
                aria-current={view === "notes" ? "page" : undefined}
              >
                <FileText size={18} aria-hidden />
              </button>
              <button
                className="nk-panel-nav-btn"
                onClick={onOpenSearch}
                title="Search (⌘K)"
                aria-label="Search"
              >
                <Search size={18} aria-hidden />
              </button>
              <button
                className={"nk-panel-nav-btn" + (view === "links" ? " active" : "")}
                onClick={() => onView("links")}
                title="Links"
                aria-label="Links"
                aria-current={view === "links" ? "page" : undefined}
              >
                <Bookmark size={18} aria-hidden />
              </button>
            </div>
            {onCollapse && (
              <button
                className="nk-iconbtn nk-panel-collapse"
                onClick={onCollapse}
                title="Hide sidebar"
                aria-label="Hide sidebar"
              >
                <PanelLeft size={18} aria-hidden />
              </button>
            )}
          </div>
        )}

        {mobileShell && <EncryptedSkippedBanner />}

        {view === "notes" && (
          <NoteList mobileShell={mobileShell} onCollapse={onCollapse} />
        )}
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
            <p>Calendar &amp; tasks.</p>
            <p className="nk-empty-hint">
              Tasks with a due date appear on the calendar. Drag them to reschedule.
            </p>
          </div>
        )}
        {view === "secrets" && (
          <SecretsView mobileShell={mobileShell} onOpened={onOpenSecret} />
        )}
        {view === "links" && (
          <LinksView mobileShell={mobileShell} onOpened={onOpenLink} />
        )}

        <VaultSwitcher className="nk-vault-switcher--footer" />
      </div>
    </aside>
  );
}
