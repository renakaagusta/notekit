import { FileText, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyInkDocument } from "../../../domain/entities/ink";
import { parseInk, serializeInk } from "../../../domain/ink";
import { journalYMDFromPath } from "../../../domain/journal";
import { useCryptoStore } from "../stores/cryptoStore";
import { findLeaf, useLayoutStore } from "../stores/layoutStore";
import type { PaneLeaf } from "../stores/layoutStore";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { useVaultStore } from "../stores/vaultStore";
import { Editor, type EditorHandle } from "./Editor";
import { EditorToolbar } from "./EditorToolbar";
import { FolderDetail } from "./FolderDetail";
import { GraphView } from "./GraphView";
import { HomePane } from "./HomePane";
import { InkCanvas } from "./InkCanvas";
import { InlineAIMenu, type InlineSelection } from "./InlineAIMenu";
import { LinkDetail } from "./LinkDetail";
import { LinkFolderDetail } from "./LinkFolderDetail";
import { NoteInfoPanel } from "./NoteInfoPanel";
import { NoteSearchBar, noteSearchSeed } from "./NoteSearchBar";
import { OutlinePanel } from "./OutlinePanel";
import { SecretDetail } from "./SecretDetail";
import { TabBar } from "./TabBar";
import { TasksView } from "./TasksView";
import { VaultDetail } from "./VaultDetail";

interface EditorPaneProps {
  paneId: string;
  zenMode: boolean;
  onZenToggle: () => void;
  vimMode: boolean;
  onVimToggle: () => void;
  onHistoryClick: () => void;
}

interface EditorBinding {
  key: string;
  body: string;
  onChange: (v: string) => void;
}

interface PaneContentProps {
  pane: PaneLeaf;
  paneId: string;
  editorRef: React.RefObject<EditorHandle>;
  editorBinding: EditorBinding | null;
  isInkNote: boolean;
  activeNoteId: string | null;
  vimMode: boolean;
  onHistoryClick: () => void;
  zenMode: boolean;
  onZenToggle: () => void;
  onVimToggle: () => void;
  searchOpen: boolean;
  searchSeed: string;
  onSearchOpen: (seed: string) => void;
  onSearchClose: () => void;
  activeSettings: ReturnType<typeof useVaultStore.getState>["activeSettings"];
  upsert: ReturnType<typeof useNotesStore.getState>["upsert"];
  openNote: ReturnType<typeof useLayoutStore.getState>["openNote"];
  closeTab: ReturnType<typeof useLayoutStore.getState>["closeTab"];
  setTicketStatus: ReturnType<typeof useTicketsStore.getState>["setStatus"];
  updateBody: ReturnType<typeof useNotesStore.getState>["updateBody"];
}

function PaneContent({
  pane,
  paneId,
  editorRef,
  editorBinding,
  isInkNote,
  activeNoteId,
  vimMode,
  onHistoryClick,
  zenMode,
  onZenToggle,
  onVimToggle,
  searchOpen,
  searchSeed,
  onSearchOpen,
  onSearchClose,
  activeSettings,
  upsert,
  openNote,
  closeTab,
  setTicketStatus,
  updateBody,
}: PaneContentProps) {
  const activeTab = pane.activeTab;
  const getEditor = useCallback(() => editorRef.current?.editor ?? null, [editorRef]);

  function handleNewNote() {
    const folder = activeSettings?.defaultFolder ?? null;
    const created = upsert({ title: "Untitled", body: "", folder });
    openNote(created.id, paneId);
  }

  function toggleSearch() {
    if (searchOpen) {
      onSearchClose();
      return;
    }
    const editor = getEditor();
    onSearchOpen(editor ? noteSearchSeed(editor) : "");
  }

  return (
    <div className="nk-editor-col">
      {editorBinding && !isInkNote && (
        <EditorToolbar
          getEditor={getEditor}
          onHistoryClick={onHistoryClick}
          zenMode={zenMode}
          onZenToggle={onZenToggle}
          vimMode={vimMode}
          onVimToggle={onVimToggle}
          searchActive={searchOpen}
          onSearchToggle={toggleSearch}
        />
      )}
      {searchOpen && editorBinding && !isInkNote && (
        <NoteSearchBar getEditor={getEditor} initialTerm={searchSeed} onClose={onSearchClose} />
      )}
      <div className="nk-editor-wrap">
        <div className="nk-editor-main">
          <PaneMainContent
            paneId={paneId}
            editorRef={editorRef}
            editorBinding={editorBinding}
            isInkNote={isInkNote}
            activeNoteId={activeNoteId}
            activeTab={activeTab}
            vimMode={vimMode}
            activeSettings={activeSettings}
            upsert={upsert}
            openNote={openNote}
            closeTab={closeTab}
            setTicketStatus={setTicketStatus}
            updateBody={updateBody}
            onNewNote={handleNewNote}
          />
        </div>
      </div>{/* nk-editor-wrap */}
    </div>
  );
}

interface PaneMainContentProps {
  paneId: string;
  editorRef: React.RefObject<EditorHandle>;
  editorBinding: EditorBinding | null;
  isInkNote: boolean;
  activeNoteId: string | null;
  activeTab: PaneLeaf["activeTab"];
  vimMode: boolean;
  activeSettings: ReturnType<typeof useVaultStore.getState>["activeSettings"];
  upsert: ReturnType<typeof useNotesStore.getState>["upsert"];
  openNote: ReturnType<typeof useLayoutStore.getState>["openNote"];
  closeTab: ReturnType<typeof useLayoutStore.getState>["closeTab"];
  setTicketStatus: ReturnType<typeof useTicketsStore.getState>["setStatus"];
  updateBody: ReturnType<typeof useNotesStore.getState>["updateBody"];
  onNewNote: () => void;
}

// eslint-disable-next-line max-lines-per-function, complexity -- dispatches over all tab/content types (ink, md, graph, tasks, link, secret, folder, vault, notFound, home); each branch is a single render leaf with no safe further reduction
function PaneMainContent({
  paneId,
  editorRef,
  editorBinding,
  isInkNote,
  activeNoteId,
  activeTab,
  vimMode,
  activeSettings,
  upsert,
  openNote,
  closeTab,
  setTicketStatus,
  updateBody,
  onNewNote,
}: PaneMainContentProps) {
  if (editorBinding && isInkNote && activeNoteId) {
    return (
      <div className="nk-ink-wrap">
        <InkCanvas
          key={editorBinding.key}
          doc={parseInk(editorBinding.body)}
          onChange={(d) => updateBody(activeNoteId, serializeInk(d))}
        />
      </div>
    );
  }

  if (editorBinding) {
    return (
      <Editor
        key={editorBinding.key}
        ref={editorRef}
        value={editorBinding.body}
        onChange={editorBinding.onChange}
        vimMode={vimMode}
      />
    );
  }

  if (activeTab?.type === "graph") return <GraphView />;

  if (activeTab?.type === "tasks") return <TasksView focusTicket={null} />;

  if (activeTab?.type === "link") {
    return (
      <LinkDetail
        linkId={activeTab.id}
        onClose={() => closeTab(activeTab, paneId)}
      />
    );
  }

  if (activeTab?.type === "secret") {
    return (
      <SecretDetail
        vault={activeTab.vault}
        name={activeTab.name}
        onClose={() => closeTab(activeTab, paneId)}
      />
    );
  }

  if (activeTab?.type === "folder") {
    return <FolderDetail path={activeTab.path} paneId={paneId} />;
  }

  if (activeTab?.type === "linkfolder") {
    return <LinkFolderDetail path={activeTab.path} paneId={paneId} />;
  }

  if (activeTab?.type === "vault") {
    return <VaultDetail slug={activeTab.slug} label={activeTab.label} paneId={paneId} />;
  }

  if (activeNoteId) {
    return (
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
    );
  }

  return (
    <HomePane
      onNewNote={onNewNote}
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
  );
}

// eslint-disable-next-line max-lines-per-function, complexity, sonarjs/cognitive-complexity -- root pane shell: hooks, drag resize, editorBinding, and panel routing all live here; cannot split without breaking hook order
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState("");
  const searchOpenRef = useRef(false);
  useEffect(() => {
    searchOpenRef.current = searchOpen;
  }, [searchOpen]);
  const openSearch = useCallback((seed: string) => {
    setSearchSeed(seed);
    setSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
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

  // ⌘F / Ctrl+F → in-note find. Only the pane whose editor is focused (or that
  // already has the bar open) responds, so split panes don't all pop a bar.
  // Intercepts the browser's native find, which can't search the ProseMirror doc.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
        const editor = editorRef.current?.editor;
        if (!editor) return;
        if (!editor.isFocused && !searchOpenRef.current) return;
        e.preventDefault();
        openSearch(noteSearchSeed(editor));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openSearch]);

  if (!pane) return null;

  const activeTab = pane.activeTab;
  const activeNoteId = activeTab?.type === "note" ? activeTab.id : null;
  const note = activeNoteId ? (notes[activeNoteId] ?? null) : null;

  // Draft journal belongs to the focused pane when no tab is active there
  const showDraft = isActive && !activeNoteId && !!draftJournal;

  const editorBinding: EditorBinding | null = showDraft
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
        onNewTab={() => {
          const folder = activeSettings?.defaultFolder ?? null;
          const created = upsert({ title: "Untitled", body: "", folder });
          openNote(created.id, paneId);
        }}
        onSplitH={() => splitPane(paneId, "horizontal")}
        onSplitV={() => splitPane(paneId, "vertical")}
        onClosePane={() => closePane(paneId)}
        onFocus={handleFocus}
        infoPanelOpen={infoPanelOpen}
        onInfoPanelToggle={editorBinding && !isInkNote ? () => setInfoPanelOpen((x) => !x) : undefined}
      />

      <div className={`nk-pane-body${(outlineOpen || infoPanelOpen) && editorBinding && !isInkNote ? " nk-pane-body--with-panel" : ""}`}>
        <PaneContent
          pane={pane}
          paneId={paneId}
          editorRef={editorRef}
          editorBinding={editorBinding}
          isInkNote={isInkNote}
          activeNoteId={activeNoteId}
          vimMode={vimMode}
          onHistoryClick={onHistoryClick}
          zenMode={zenMode}
          onZenToggle={onZenToggle}
          onVimToggle={onVimToggle}
          searchOpen={searchOpen}
          searchSeed={searchSeed}
          onSearchOpen={openSearch}
          onSearchClose={closeSearch}
          activeSettings={activeSettings}
          upsert={upsert}
          openNote={openNote}
          closeTab={closeTab}
          setTicketStatus={setTicketStatus}
          updateBody={updateBody}
        />
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
