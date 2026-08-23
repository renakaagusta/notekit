import { FileText, Home, ListChecks, Menu } from "lucide-react";
import type { SidebarView } from "./Sidebar";

interface MobileBottomNavProps {
  view: SidebarView;
  onView: (v: SidebarView) => void;
  onOpenMenu: () => void;
}

/**
 * iOS-style floating tab bar for the mobile shell. The four most-used surfaces
 * sit here; the full surface list + account live behind "Menu" (the drawer).
 */
export function MobileBottomNav({ view, onView, onOpenMenu }: MobileBottomNavProps) {
  return (
    <nav className="nk-bottomnav" aria-label="Primary">
      <button
        className={`nk-bottomnav-item${view === "home" ? " is-on" : ""}`}
        onClick={() => onView("home")}
      >
        <Home size={23} aria-hidden />
        <span>Home</span>
      </button>
      <button
        className={`nk-bottomnav-item${view === "calendar" || view === "tickets" ? " is-on" : ""}`}
        onClick={() => onView("calendar")}
      >
        <ListChecks size={23} aria-hidden />
        <span>Tasks</span>
      </button>
      <button
        className={`nk-bottomnav-item${view === "notes" ? " is-on" : ""}`}
        onClick={() => onView("notes")}
      >
        <FileText size={23} aria-hidden />
        <span>Notes</span>
      </button>
      <button className="nk-bottomnav-item" onClick={onOpenMenu}>
        <Menu size={23} aria-hidden />
        <span>Menu</span>
      </button>
    </nav>
  );
}
