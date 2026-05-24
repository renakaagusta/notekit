import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Bot,
  Calendar,
  Clock,
  FileText,
  KeyRound,
  Link as LinkIcon,
  LogOut,
  Lock,
  MoreHorizontal,
  Share2,
  Ticket,
  X,
} from "lucide-react";
import type { SidebarView } from "./Sidebar";
import { VaultSwitcher } from "./VaultSwitcher";
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
  onOpenNotifications?: () => void;
}

/**
 * Left-side slide-in drawer that replaces the desktop sidebar's tab strip
 * on mobile. Holds the vault switcher, all six top-level surfaces, account
 * actions, and the sync status row. Mirrors Obsidian / Bear's drawer
 * pattern — one global nav surface instead of a persistent bottom bar.
 */
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
  onOpenNotifications,
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
        <header className="nk-mdrawer-hd">
          <VaultSwitcher />
          <button
            className="nk-iconbtn nk-mdrawer-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

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

        <nav className="nk-mdrawer-section" aria-label="Surfaces">
          <ul className="nk-mdrawer-list">
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
                className={view === "tickets" ? "active" : ""}
                onClick={() => pick("tickets")}
              >
                <Ticket size={16} aria-hidden />
                <span>Tickets</span>
              </button>
            </li>
            <li>
              <button
                className={view === "calendar" ? "active" : ""}
                onClick={() => pick("calendar")}
              >
                <Calendar size={16} aria-hidden />
                <span>Calendar</span>
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
          </ul>
        </nav>

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
      </aside>
    </div>
  );
}
