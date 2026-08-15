import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Bot,
  Clock,
  FileText,
  Home,
  KeyRound,
  Link as LinkIcon,
  ListChecks,
  LogOut,
  Lock,
  Menu,
  MonitorSmartphone,
  MoreHorizontal,
  Settings,
  Share2,
} from "lucide-react";
import type { SidebarView } from "./Sidebar";
import { VaultSwitcher } from "./VaultSwitcher";
import { NotekitIcon } from "./BrandIcons";
import type { User } from "../types/user";

interface MobileDrawerProps {
  open: boolean;
  onClose(): void;
  view: SidebarView;
  onView(v: SidebarView): void;
  user?: User | null;
  syncStatus?: string;
  syncTone?: "idle" | "sync" | "error" | "ready";
  onSignOut?: () => void;
  onOpenAgents?: () => void;
  onOpenHistory?: () => void;
  onOpenTokens?: () => void;
  onOpenDevices?: () => void;
  onOpenNotifications?: () => void;
  onOpenSettings?: () => void;
}

/**
 * Left-side slide-in drawer that replaces the desktop sidebar's tab strip
 * on mobile. Holds the vault switcher, all six top-level surfaces, account
 * actions, and the sync status row. Mirrors Obsidian / Bear's drawer
 * pattern — one global nav surface instead of a persistent bottom bar.
 */
// eslint-disable-next-line max-lines-per-function, complexity -- full-screen mobile navigation drawer with vault switcher, multiple surfaces, and account menu
export function MobileDrawer({
  open,
  onClose,
  view,
  onView,
  user,
  syncStatus,
  syncTone,
  onSignOut,
  onOpenAgents,
  onOpenHistory,
  onOpenTokens,
  onOpenDevices,
  onOpenNotifications,
  onOpenSettings,
}: MobileDrawerProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (userMenuOpen) setUserMenuOpen(false);
        else onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, userMenuOpen]);

  // Close the user popover when the user taps anywhere outside it.
  // Limited to inside the drawer so taps on the drawer backdrop still
  // dismiss the whole drawer.
  useEffect(() => {
    if (!userMenuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!userRef.current) return;
      if (userRef.current.contains(e.target as Node)) return;
      setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [userMenuOpen]);

  // Collapse the popover whenever the drawer itself closes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived UI state on close is intentional; no external subscription involved
    if (!open) setUserMenuOpen(false);
  }, [open]);

  if (!open) return null;

  function pick(next: SidebarView) {
    onView(next);
    onClose();
  }

  return (
    <div
      className="nk-mdrawer-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="nk-mdrawer"
        role="dialog"
        aria-label="Navigation"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Brand anchors the top exactly like the desktop sidebar — app
            identity first, the vault switcher + account cluster at the
            foot. Keeps the two shells visually consistent. */}
        <header className="nk-mdrawer-hd">
          <div className="nk-mdrawer-brand">
            <NotekitIcon size={18} className="nk-brand-mark" />
            <span className="nk-brand-word">NoteKit</span>
          </div>
          <button
            className="nk-iconbtn nk-mdrawer-close"
            onClick={onClose}
            aria-label="Close menu"
            title="Close menu"
          >
            {/* Hamburger here mirrors the trigger in the appbar — same
                icon for "open" and "close" so the gesture is symmetric
                and the user always knows that tapping the icon toggles
                the drawer. */}
            <Menu size={18} aria-hidden />
          </button>
        </header>

        <nav className="nk-mdrawer-section" aria-label="Surfaces">
          <ul className="nk-mdrawer-list">
            <li>
              <button
                className={view === "home" ? "active" : ""}
                onClick={() => pick("home")}
              >
                <Home size={16} aria-hidden />
                <span>Home</span>
              </button>
            </li>
            <li>
              <button
                className={view === "notes" ? "active" : ""}
                onClick={() => pick("notes")}
              >
                <FileText size={16} aria-hidden />
                <span>Notes</span>
              </button>
            </li>
            <li>
              <button
                className={view === "calendar" || view === "tickets" ? "active" : ""}
                onClick={() => pick("calendar")}
              >
                <ListChecks size={16} aria-hidden />
                <span>Tasks</span>
              </button>
            </li>
            <li>
              <button
                className={view === "graph" ? "active" : ""}
                onClick={() => pick("graph")}
              >
                <Share2 size={16} aria-hidden />
                <span>Graph</span>
              </button>
            </li>
            <li>
              <button
                className={view === "secrets" ? "active" : ""}
                onClick={() => pick("secrets")}
              >
                <Lock size={16} aria-hidden />
                <span>Secrets</span>
              </button>
            </li>
            <li>
              <button
                className={view === "links" ? "active" : ""}
                onClick={() => pick("links")}
              >
                <LinkIcon size={16} aria-hidden />
                <span>Links</span>
              </button>
            </li>
            {onOpenSettings && (
              <li>
                <button onClick={() => { onOpenSettings(); onClose(); }}>
                  <Settings size={16} aria-hidden />
                  <span>Settings</span>
                </button>
              </li>
            )}
          </ul>
        </nav>

        {/* Foot cluster pinned to the bottom — vault switcher, sync status,
            then account. Mirrors the desktop sidebar footer ordering. */}
        <div className="nk-mdrawer-foot">
          <VaultSwitcher />

          {syncStatus && (
            <div
              className="nk-mdrawer-sync"
              data-tone={syncTone ?? "idle"}
              aria-live="polite"
            >
              <span className="nk-mdrawer-sync-dot" aria-hidden />
              <span className="nk-mdrawer-sync-text">{syncStatus}</span>
            </div>
          )}

          {user && (
          <div className="nk-mdrawer-user" ref={userRef}>
            {user.avatarUrl ? (
              <img
                className="nk-avatar"
                src={user.avatarUrl}
                alt=""
                aria-hidden
              />
            ) : (
              <div className="nk-avatar nk-avatar--placeholder" aria-hidden>
                {(user.name ?? user.email).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="nk-mdrawer-user-meta">
              <div className="nk-mdrawer-user-name">
                {user.name ?? user.email}
              </div>
              <div className="nk-mdrawer-user-plan">{user.plan}</div>
            </div>
            <button
              className="nk-iconbtn"
              onClick={() => setUserMenuOpen((v) => !v)}
              title="Account menu"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
            >
              <MoreHorizontal size={16} aria-hidden />
            </button>
            {userMenuOpen && (
              <div
                className="nk-popover nk-mdrawer-user-menu"
                role="menu"
                aria-label="Account actions"
              >
                {onOpenHistory && (
                  <button
                    className="nk-popover-item"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onClose();
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
                      onClose();
                      onOpenAgents();
                    }}
                  >
                    <Bot size={14} aria-hidden />
                    <span>Agents</span>
                  </button>
                )}
                {onOpenNotifications && (
                  <button
                    className="nk-popover-item"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onClose();
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
                      onClose();
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
                      onClose();
                      onOpenDevices();
                    }}
                  >
                    <MonitorSmartphone size={14} aria-hidden />
                    <span>Devices</span>
                  </button>
                )}
                {onSignOut && (
                  <button
                    className="nk-popover-item nk-popover-item--danger"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onClose();
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
        </div>
      </aside>
    </div>
  );
}
