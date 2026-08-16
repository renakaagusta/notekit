import { useEffect, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { HomePane } from "./HomePane";
import { SecretDetail } from "./SecretDetail";
import { FolderDetail } from "./FolderDetail";
import { VaultDetail } from "./VaultDetail";
import { LinkDetail } from "./LinkDetail";
import { LinkFolderDetail } from "./LinkFolderDetail";
import { useNotesStore } from "../stores/notesStore";
import { useVaultStore } from "../stores/vaultStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { findLeaf, useLayoutStore } from "../stores/layoutStore";
import { journalYMDFromPath } from "../lib/journal";
import { parseInk, serializeInk } from "../lib/ink";
import { emptyInkDocument } from "../types/ink";
import { Editor, type EditorHandle } from "./Editor";
import { EditorToolbar } from "./EditorToolbar";
import { OutlinePanel } from "./OutlinePanel";
import { InlineAIMenu, type InlineSelection } from "./InlineAIMenu";
import { useCryptoStore } from "../stores/cryptoStore";
import { InkCanvas } from "./InkCanvas";
import { TabBar } from "./TabBar";
import { GraphView } from "./GraphView";
import { TasksView } from "./TasksView";
import { NoteInfoPanel } from "./NoteInfoPanel";

interface EditorPaneProps {
  paneId: string;
  zenMode: boolean;
  onZenToggle: () => void;
  vimMode: boolean;
  onVimToggle: () => void;
  onHistoryClick: () => void;
}

// eslint-disable-next-line max-lines-per-function, complexity -- large React component; complex dispatch over multiple tab types, content modes, and panel states
export function EditorPane({
  paneId,
  zenMode,
  onZenToggle,
  vimMode,
  onVimToggle,
  onHistoryClick,
}: EditorPaneProps) {
  const editorRef = useRef<EditorHandle>(null);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [inlineAI, setInlineAI] = useState<InlineSelection | null>(null);
  const aiDevice = useCryptoStore((s) => s.device);
  const [rightPanelWidth, setRightPanelWidth] = useState(
    () => Number(localStorage.getItem("nk:right-panel-width") || 0) || 220,
  );
  useEffect(() => {
    localStorage.setItem("nk:right-panel-width", String(rightPanelWidth));
  }, [rightPanelWidth]);
  const rightPanelDragRef = useRef<{ startX: number; startW: number } | null>(null);
  function onRightPanelDragStart(e: React.MouseEvent) {
    e.preventDefault();
    rightPanelDragRef.current = { startX: e.clientX, startW: rightPanelWidth };
    function onMove(ev: MouseEvent) {
      if (!rightPanelDragRef.current) return;
      const w = Math.min(500, Math.max(160, rightPanelDragRef.current.startW + (rightPanelDragRef.current.startX - ev.clientX)));
      setRightPanelWidth(w);
    }
    function onUp() {
      rightPanelDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

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
  const setTicketStatus = useTicketsStore((s) => s.setStatus);

  // ⌘⇧K → inline AI transform on the current selection. (⌘K / ⌘P are the
  // search palette, so the AI transform takes the shifted variant.) Guarded
  // by editor focus so only the focused pane's editor responds.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        const editor = editorRef.current?.editor;
        if (!editor || !editor.isFocused) return;
        const { from, to } = editor.state.selection;
        if (from === to) return;
        e.preventDefault();
        const text = editor.state.doc.textBetween(from, to, " ");
        const coords = editor.view.coordsAtPos(from);
        setInlineAI({ from, to, text, x: coords.left, y: coords.bottom });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!pane) return null;

  const activeTab = pane.activeTab;
  const activeNoteId = activeTab?.type === "note" ? activeTab.id : null;
  const note = activeNoteId ? (notes[activeNoteId] ?? null) : null;

  // Draft journal belongs to the focused pane when no tab is active there
  const showDraft = isActive && !activeNoteId && !!draftJournal;

  const editorBinding = showDraft
    ? {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- showDraft guarantees draftJournal is non-null
        key: `journal-${draftJournal!.date}`,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- showDraft guarantees draftJournal is non-null
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
        onActivateTab={(tab) => activateTab(tab, paneId)}
        onCloseTab={(tab) => closeTab(tab, paneId)}
        onNewTab={handleNewNote}
        onSplitH={() => splitPane(paneId, "horizontal")}
        onSplitV={() => splitPane(paneId, "vertical")}
        onClosePane={() => closePane(paneId)}
        onFocus={handleFocus}
        infoPanelOpen={infoPanelOpen}
        onInfoPanelToggle={editorBinding && !isInkNote ? () => setInfoPanelOpen((x) => !x) : undefined}
      />

      <div className={`nk-pane-body${(outlineOpen || infoPanelOpen) && editorBinding && !isInkNote ? " nk-pane-body--with-panel" : ""}`}>
        <div className="nk-editor-col">
          {editorBinding && !isInkNote && (
            <EditorToolbar
              getEditor={() => editorRef.current?.editor ?? null}
              onHistoryClick={onHistoryClick}
              zenMode={zenMode}
              onZenToggle={onZenToggle}
              vimMode={vimMode}
              onVimToggle={onVimToggle}
            />
          )}
          <div className="nk-editor-wrap">
            <div className="nk-editor-main">
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
              ) : activeTab?.type === "graph" ? (
                <GraphView />
              ) : activeTab?.type === "tasks" ? (
                <TasksView focusTicket={null} />
              ) : activeTab?.type === "link" ? (
                <LinkDetail
                  linkId={activeTab.id}
                  onClose={() => closeTab(activeTab, paneId)}
                />
              ) : activeTab?.type === "secret" ? (
                <SecretDetail
                  vault={activeTab.vault}
                  name={activeTab.name}
                  onClose={() => closeTab(activeTab, paneId)}
                />
              ) : activeTab?.type === "folder" ? (
                <FolderDetail path={activeTab.path} paneId={paneId} />
              ) : activeTab?.type === "linkfolder" ? (
                <LinkFolderDetail path={activeTab.path} paneId={paneId} />
              ) : activeTab?.type === "vault" ? (
                <VaultDetail slug={activeTab.slug} label={activeTab.label} paneId={paneId} />
              ) : activeNoteId ? (
                <div className="nk-empty nk-empty--center">
                  <FileText
                    size={36}
                    aria-hidden
                    style={{ color: "var(--muted)", opacity: 0.4, marginBottom: 14 }}
                  />
                  <p>Note not found.</p>
                  <p className="nk-empty-hint">This note may still be syncing.</p>
                  <div className="nk-empty-cta-row">
                    {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- activeNoteId is truthy so activeTab is set */}
                    <button className="nk-empty-cta" onClick={() => closeTab(activeTab!, paneId)}>
                      <X size={14} aria-hidden /> Close tab
                    </button>
                  </div>
                </div>
              ) : (
                <HomePane
                  onNewNote={handleNewNote}
                  onNewDrawing={() => {
                    const folder = activeSettings?.defaultFolder ?? null;
                    const created = upsert({
                      title: "Drawing",
                      body: serializeInk(emptyInkDocument()),
                      folder,
                      format: "ink",
                    });
                    openNote(created.id, paneId);
                  }}
                  onOpenNote={(id) => openNote(id, paneId)}
                  onToggleTicket={(id) => setTicketStatus(id, "done")}
                />
              )}
            </div>
          </div>{/* nk-editor-wrap */}
        </div>{/* nk-editor-col */}
        {/* Right panels — full height, resizable */}
        {(outlineOpen || infoPanelOpen) && editorBinding && !isInkNote && (
          <div className="nk-right-panel" style={{ width: rightPanelWidth }}>
            <div className="nk-right-panel-resizer" onMouseDown={onRightPanelDragStart} />
            {outlineOpen && (
              <OutlinePanel
                getEditor={() => editorRef.current?.editor ?? null}
                onClose={() => toggleOutline(paneId)}
              />
            )}
            {infoPanelOpen && (
              <NoteInfoPanel
                noteId={activeNoteId}
                getEditor={() => editorRef.current?.editor ?? null}
              />
            )}
          </div>
        )}
      </div>{/* nk-pane-body */}
      {/* eslint-disable-next-line react-hooks/refs -- editorRef.current is read here to conditionally render InlineAIMenu; editor instance is stable between renders and this is intentional */}
      {inlineAI && aiDevice && (() => {
        const currentEditor = editorRef.current?.editor;
        if (!currentEditor) return null;
        return (
          <InlineAIMenu
            editor={currentEditor}
            device={aiDevice}
            sel={inlineAI}
            onClose={() => setInlineAI(null)}
          />
        );
      })()}
    </div>
  );
}

