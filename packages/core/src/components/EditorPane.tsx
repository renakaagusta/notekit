import { useRef } from "react";
import { FileText, Pencil, Plus } from "lucide-react";
import { useNotesStore } from "../stores/notesStore";
import { useVaultStore } from "../stores/vaultStore";
import { findLeaf, useLayoutStore } from "../stores/layoutStore";
import { journalYMDFromPath } from "../lib/journal";
import { parseInk, serializeInk } from "../lib/ink";
import { emptyInkDocument } from "../types/ink";
import { Editor, type EditorHandle } from "./Editor";
import { EditorToolbar } from "./EditorToolbar";
import { OutlinePanel } from "./OutlinePanel";
import { InkCanvas } from "./InkCanvas";
import { TabBar } from "./TabBar";

interface EditorPaneProps {
  paneId: string;
  zenMode: boolean;
  onZenToggle: () => void;
  vimMode: boolean;
  onVimToggle: () => void;
  onHistoryClick: () => void;
}

export function EditorPane({
  paneId,
  zenMode,
  onZenToggle,
  vimMode,
  onVimToggle,
  onHistoryClick,
}: EditorPaneProps) {
  const editorRef = useRef<EditorHandle>(null);

  const pane = useLayoutStore((s) => findLeaf(s.layout, paneId));
  const activePaneId = useLayoutStore((s) => s.activePaneId);
  const isActive = activePaneId === paneId;
  const layout = useLayoutStore((s) => s.layout);
  const canClose = layout.id !== paneId;

  const openNote = useLayoutStore((s) => s.openNote);
  const closeTab = useLayoutStore((s) => s.closeTab);
  const activateTab = useLayoutStore((s) => s.activateTab);
  const splitPane = useLayoutStore((s) => s.splitPane);
  const closePane = useLayoutStore((s) => s.closePane);
  const setActivePaneId = useLayoutStore((s) => s.setActivePaneId);
  const toggleOutline = useLayoutStore((s) => s.toggleOutline);

  const notes = useNotesStore((s) => s.notes);
  const updateBody = useNotesStore((s) => s.updateBody);
  const updateJournalDraftBody = useNotesStore((s) => s.updateJournalDraftBody);
  const draftJournal = useNotesStore((s) => s.draftJournal);
  const upsert = useNotesStore((s) => s.upsert);
  const activeSettings = useVaultStore((s) => s.activeSettings);

  if (!pane) return null;

  const activeNoteId = pane.activeTab;
  const note = activeNoteId ? notes[activeNoteId] : null;

  // Draft journal belongs to the focused pane when no tab is active there
  const showDraft = isActive && !activeNoteId && !!draftJournal;

  const editorBinding = showDraft
    ? {
        key: `journal-${draftJournal!.date}`,
        body: draftJournal!.body,
        onChange: updateJournalDraftBody,
      }
    : activeNoteId && note
      ? (() => {
          const journalDate = journalYMDFromPath(note.path);
          return {
            key: journalDate ? `journal-${journalDate}` : activeNoteId,
            body: note.body,
            onChange: (v: string) => updateBody(activeNoteId, v),
          };
        })()
      : null;

  const isInkNote = !showDraft && note?.format === "ink" && !!activeNoteId;
  const outlineOpen = pane.outlineOpen;

  function handleFocus() {
    if (!isActive) setActivePaneId(paneId);
  }

  function handleNewNote() {
    const folder = activeSettings?.defaultFolder ?? null;
    const created = upsert({ title: "Untitled", body: "", folder });
    openNote(created.id, paneId);
  }

  return (
    <div
      className={`nk-pane${isActive ? " nk-pane--active" : ""}`}
      onMouseDown={handleFocus}
      onClick={handleFocus}
    >
      <TabBar
        pane={pane}
        isActive={isActive}
        canClose={canClose}
        onActivateTab={(noteId) => activateTab(noteId, paneId)}
        onCloseTab={(noteId) => closeTab(noteId, paneId)}
        onSplitH={() => splitPane(paneId, "horizontal")}
        onSplitV={() => splitPane(paneId, "vertical")}
        onClosePane={() => closePane(paneId)}
        onFocus={handleFocus}
      />

      {editorBinding && !isInkNote && (
        <EditorToolbar
          getEditor={() => editorRef.current?.editor ?? null}
          onHistoryClick={onHistoryClick}
          zenMode={zenMode}
          onZenToggle={onZenToggle}
          outlineOpen={outlineOpen}
          onOutlineToggle={() => toggleOutline(paneId)}
          vimMode={vimMode}
          onVimToggle={onVimToggle}
        />
      )}

      <div
        className={`nk-editor-wrap${outlineOpen && editorBinding && !isInkNote ? " nk-editor-wrap--outlined" : ""}`}
      >
        {outlineOpen && editorBinding && !isInkNote && (
          <OutlinePanel
            getEditor={() => editorRef.current?.editor ?? null}
            onClose={() => toggleOutline(paneId)}
          />
        )}
        {editorBinding && isInkNote && activeNoteId ? (
          <div className="nk-ink-wrap">
            <InkCanvas
              key={editorBinding.key}
              doc={parseInk(editorBinding.body)}
              onChange={(d) => updateBody(activeNoteId, serializeInk(d))}
            />
          </div>
        ) : editorBinding ? (
          <Editor
            key={editorBinding.key}
            ref={editorRef}
            value={editorBinding.body}
            onChange={editorBinding.onChange}
            vimMode={vimMode}
          />
        ) : (
          <div className="nk-empty nk-empty--center">
            <FileText
              size={36}
              aria-hidden
              style={{ color: "var(--muted)", opacity: 0.4, marginBottom: 14 }}
            />
            <p>No note open.</p>
            <p className="nk-empty-hint">Pick one from the sidebar, or:</p>
            <div className="nk-empty-cta-row">
              <button className="nk-empty-cta" onClick={handleNewNote}>
                <Plus size={14} aria-hidden /> New note
              </button>
              <button
                className="nk-empty-cta"
                onClick={() => {
                  const folder = activeSettings?.defaultFolder ?? null;
                  const created = upsert({
                    title: "Drawing",
                    body: serializeInk(emptyInkDocument()),
                    folder,
                    format: "ink",
                  });
                  openNote(created.id, paneId);
                }}
              >
                <Pencil size={14} aria-hidden /> New drawing
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
