import { Columns2, Folder, Link2, Network, CalendarDays, PanelRight, Plus, Rows2, Shield, X } from "lucide-react";
import { noteTitle } from "../../../domain/note-display";
import { tabKey } from "../stores/layoutStore";
import type { PaneLeaf, TabEntry } from "../stores/layoutStore";
import { useLinksStore } from "../stores/linksStore";
import { useNotesStore } from "../stores/notesStore";

interface TabBarProps {
  pane: PaneLeaf;
  isActive: boolean;
  canClose: boolean;
  onActivateTab: (tab: TabEntry) => void;
  onCloseTab: (tab: TabEntry) => void;
  onNewTab: () => void;
  onSplitH: () => void;
  onSplitV: () => void;
  onClosePane: () => void;
  onFocus: () => void;
  infoPanelOpen?: boolean;
  onInfoPanelToggle?: () => void;
}

function useTabLabel(tab: TabEntry): string {
  const notes = useNotesStore((s) => s.notes);
  const allLinks = useLinksStore((s) => s.all());
  if (tab.type === "note") {
    const note = notes[tab.id];
    return note ? noteTitle(note) : "Untitled";
  }
  if (tab.type === "link") {
    const link = allLinks.find((l: { id: string; title: string }) => l.id === tab.id);
    return link?.title || "Link";
  }
  if (tab.type === "graph") return "Graph";
  if (tab.type === "tasks") return "Tasks";
  if (tab.type === "folder" || tab.type === "linkfolder") {
    return tab.path.split("/").filter(Boolean).pop() || "Folder";
  }
  if (tab.type === "vault") return tab.label;
  return tab.name;
}

function TabIcon({ tab }: { tab: TabEntry }) {
  if (tab.type === "link") return <Link2 size={11} aria-hidden style={{ flexShrink: 0 }} />;
  if (tab.type === "secret") return <Shield size={11} aria-hidden style={{ flexShrink: 0 }} />;
  if (tab.type === "folder" || tab.type === "linkfolder" || tab.type === "vault") return <Folder size={11} aria-hidden style={{ flexShrink: 0 }} />;
  if (tab.type === "graph") return <Network size={11} aria-hidden style={{ flexShrink: 0 }} />;
  if (tab.type === "tasks") return <CalendarDays size={11} aria-hidden style={{ flexShrink: 0 }} />;
  return null;
}

// eslint-disable-next-line max-lines-per-function -- React component with drag-and-drop tab reordering and context menus; splitting would fragment the gesture logic
export function TabBar({
  pane,
  isActive,
  canClose,
  onActivateTab,
  onCloseTab,
  onNewTab,
  onSplitH,
  onSplitV,
  onClosePane,
  onFocus,
  infoPanelOpen,
  onInfoPanelToggle,
}: TabBarProps) {
  return (
    <div
      className={`nk-tab-bar${isActive ? " nk-tab-bar--active" : ""}`}
      onMouseDown={onFocus}
    >
      <div className="nk-tab-bar-tabs">
        {pane.tabs.map((tab) => {
          const key = tabKey(tab);
          const active = !!pane.activeTab && tabKey(pane.activeTab) === key;
          return (
            <TabItem
              key={key}
              tab={tab}
              active={active}
              onActivate={() => onActivateTab(tab)}
              onClose={() => onCloseTab(tab)}
            />
          );
        })}
      </div>
      <button
        type="button"
        className="nk-tab-new"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onNewTab();
        }}
        title="New note in this pane"
        aria-label="New note"
      >
        <Plus size={12} aria-hidden />
      </button>
      <div className="nk-tab-bar-actions">
        <button
          className="nk-iconbtn nk-tab-action"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSplitH();
          }}
          title="Split right"
          aria-label="Split right"
        >
          <Columns2 size={13} aria-hidden />
        </button>
        <button
          className="nk-iconbtn nk-tab-action"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSplitV();
          }}
          title="Split down"
          aria-label="Split down"
        >
          <Rows2 size={13} aria-hidden />
        </button>
        {onInfoPanelToggle && (
          <button
            className={`nk-iconbtn nk-tab-action${infoPanelOpen ? " is-active" : ""}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onInfoPanelToggle();
            }}
            title="Note info panel"
            aria-label="Toggle note info panel"
          >
            <PanelRight size={13} aria-hidden />
          </button>
        )}
        {canClose && (
          <button
            className="nk-iconbtn nk-tab-action"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClosePane();
            }}
            title="Close pane"
            aria-label="Close pane"
          >
            <X size={13} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function TabItem({
  tab,
  active,
  onActivate,
  onClose,
}: {
  tab: TabEntry;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const label = useTabLabel(tab);
  return (
    <div
      className={`nk-tab${active ? " nk-tab--active" : ""}`}
      onMouseDown={(e) => {
        e.stopPropagation();
        onActivate();
      }}
      title={label}
    >
      <TabIcon tab={tab} />
      <span className="nk-tab-label">{label}</span>
      <button
        className="nk-tab-close nk-iconbtn"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={`Close ${label}`}
      >
        <X size={11} aria-hidden />
      </button>
    </div>
  );
}
