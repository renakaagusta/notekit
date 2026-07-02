import { Columns2, Rows2, X } from "lucide-react";
import { useNotesStore } from "../stores/notesStore";
import { noteTitle } from "../lib/note-display";
import type { PaneLeaf } from "../stores/layoutStore";

interface TabBarProps {
  pane: PaneLeaf;
  isActive: boolean;
  canClose: boolean;
  onActivateTab: (noteId: string) => void;
  onCloseTab: (noteId: string) => void;
  onSplitH: () => void;
  onSplitV: () => void;
  onClosePane: () => void;
  onFocus: () => void;
}

export function TabBar({
  pane,
  isActive,
  canClose,
  onActivateTab,
  onCloseTab,
  onSplitH,
  onSplitV,
  onClosePane,
  onFocus,
}: TabBarProps) {
  const notes = useNotesStore((s) => s.notes);

  return (
    <div
      className={`nk-tab-bar${isActive ? " nk-tab-bar--active" : ""}`}
      onMouseDown={onFocus}
    >
      <div className="nk-tab-bar-tabs">
        {pane.tabs.map((noteId) => {
          const note = notes[noteId];
          const label = note ? noteTitle(note) : "Untitled";
          const active = pane.activeTab === noteId;
          return (
            <div
              key={noteId}
              className={`nk-tab${active ? " nk-tab--active" : ""}`}
              onMouseDown={(e) => {
                e.stopPropagation();
                onActivateTab(noteId);
              }}
              title={label}
            >
              <span className="nk-tab-label">{label}</span>
              <button
                className="nk-tab-close nk-iconbtn"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(noteId);
                }}
                aria-label={`Close ${label}`}
              >
                <X size={11} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
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
