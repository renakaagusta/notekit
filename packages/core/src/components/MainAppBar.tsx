import { ArrowLeft, Menu, PanelLeft, Search } from "lucide-react";
import type { VaultSettings } from "../domain/entities/vault";
import { useLayoutStore } from "../stores/layoutStore";
import { useNotesStore } from "../stores/notesStore";
import type { MainView } from "./AppTypes";

interface MainAppBarProps {
  isMobile: boolean;
  view: MainView;
  sidebarCollapsed: boolean;
  viewOwnsTitle: boolean;
  mobilePane: "list" | "detail";
  crumbLabel: string;
  activeSettings: VaultSettings | null;
  onExpandSidebar: () => void;
  onExitMobileDetail: () => void;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
}

interface AppBarNavButtonProps {
  isMobile: boolean;
  view: MainView;
  sidebarCollapsed: boolean;
  mobilePane: "list" | "detail";
  onExpandSidebar: () => void;
  onExitMobileDetail: () => void;
  onOpenMenu: () => void;
}

function AppBarNavButton({
  isMobile,
  view,
  sidebarCollapsed,
  mobilePane,
  onExpandSidebar,
  onExitMobileDetail,
  onOpenMenu,
}: AppBarNavButtonProps) {
  if (!isMobile && sidebarCollapsed) {
    return (
      <button className="nk-iconbtn nk-main-expand" onClick={onExpandSidebar} aria-label="Show sidebar" title="Show sidebar">
        <PanelLeft size={16} aria-hidden />
      </button>
    );
  }
  const isDetailView =
    isMobile &&
    (view === "notes" || view === "secrets" || view === "links") &&
    mobilePane === "detail";
  if (isDetailView) {
    return (
      <button className="nk-iconbtn nk-main-back" onClick={onExitMobileDetail} aria-label="Back" title="Back">
        <ArrowLeft size={18} aria-hidden />
      </button>
    );
  }
  if (isMobile) {
    return (
      <button className="nk-iconbtn nk-main-menu" onClick={onOpenMenu} aria-label="Open menu" title="Menu">
        <Menu size={18} aria-hidden />
      </button>
    );
  }
  return null;
}

interface AppBarActionsProps {
  isMobile: boolean;
  view: MainView;
  mobilePane: "list" | "detail";
  activeSettings: VaultSettings | null;
  onOpenSearch: () => void;
}

function AppBarActions({ isMobile, view, mobilePane, activeSettings, onOpenSearch }: AppBarActionsProps) {
  const upsert = useNotesStore((s) => s.upsert);
  const openNoteInLayout = useLayoutStore((s) => s.openNote);
  const showSearch = isMobile && view !== "graph" && (view === "notes" ? mobilePane === "list" : true);
  const showNewNote = view === "notes" && (!isMobile || mobilePane === "list");
  return (
    <span className="nk-main-hd-actions">
      {showSearch && (
        <button className="nk-iconbtn" onClick={onOpenSearch} aria-label="Search" title="Search">
          <Search size={16} aria-hidden />
        </button>
      )}
      {showNewNote && (
        <button
          className="nk-iconbtn"
          title="New note (⌘N)"
          onClick={() => {
            const folder = activeSettings?.defaultFolder ?? null;
            const created = upsert({ title: "Untitled", body: "", folder });
            openNoteInLayout(created.id);
          }}
          aria-label="New note"
        >
          +
        </button>
      )}
    </span>
  );
}

export function MainAppBar({
  isMobile,
  view,
  sidebarCollapsed,
  viewOwnsTitle,
  mobilePane,
  crumbLabel,
  activeSettings,
  onExpandSidebar,
  onExitMobileDetail,
  onOpenMenu,
  onOpenSearch,
}: MainAppBarProps) {
  const showBar =
    (isMobile && view !== "home") ||
    sidebarCollapsed ||
    (!viewOwnsTitle && view !== "notes" && view !== "secrets" && view !== "links");

  if (!showBar) return null;

  return (
    <header className="nk-main-hd">
      <AppBarNavButton
        isMobile={isMobile}
        view={view}
        sidebarCollapsed={sidebarCollapsed}
        mobilePane={mobilePane}
        onExpandSidebar={onExpandSidebar}
        onExitMobileDetail={onExitMobileDetail}
        onOpenMenu={onOpenMenu}
      />
      <div className="nk-crumbs">
        <span className="last">{crumbLabel}</span>
      </div>
      <AppBarActions
        isMobile={isMobile}
        view={view}
        mobilePane={mobilePane}
        activeSettings={activeSettings}
        onOpenSearch={onOpenSearch}
      />
    </header>
  );
}
