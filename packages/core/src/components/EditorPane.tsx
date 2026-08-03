import { useRef, useState } from "react";
import { ExternalLink, FileText, Pencil, Plus, Shield, X } from "lucide-react";
import { HomePane } from "./HomePane";
import { useNotesStore } from "../stores/notesStore";
import { useLinksStore } from "../stores/linksStore";
import { useVaultStore } from "../stores/vaultStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { findLeaf, useLayoutStore } from "../stores/layoutStore";
import { journalYMDFromPath } from "../lib/journal";
import { parseInk, serializeInk } from "../lib/ink";
import { emptyInkDocument } from "../types/ink";
import { Editor, type EditorHandle } from "./Editor";
import { EditorToolbar } from "./EditorToolbar";
import { OutlinePanel } from "./OutlinePanel";
import { InkCanvas } from "./InkCanvas";
import { TabBar } from "./TabBar";
import { GraphView } from "./GraphView";
import { TasksView } from "./TasksView";
import { NoteInfoPanel } from "./NoteInfoPanel";
import type { TabEntry } from "../stores/layoutStore";

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
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);

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
  const links = useLinksStore((s) => s.all());
  const activeSettings = useVaultStore((s) => s.activeSettings);
  const vaultReady = useVaultStore((s) => s.phase === "ready");
  const setTicketStatus = useTicketsStore((s) => s.setStatus);

  if (!pane) return null;

  const activeTab = pane.activeTab;
  const activeNoteId = activeTab?.type === "note" ? activeTab.id : null;
  const note = activeNoteId ? (notes[activeNoteId] ?? null) : null;

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
          <LinkTabView
            linkId={activeTab.id}
            links={links}
            onClose={() => closeTab(activeTab, paneId)}
          />
        ) : activeTab?.type === "secret" ? (
          <SecretTabView
            vault={activeTab.vault}
            name={activeTab.name}
            onClose={() => closeTab(activeTab, paneId)}
          />
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
        {infoPanelOpen && editorBinding && !isInkNote && (
          <NoteInfoPanel noteId={activeNoteId} />
        )}
      </div>
    </div>
  );
}

import type { SavedLink } from "../types/link";

function LinkTabView({
  linkId,
  links,
  onClose,
}: {
  linkId: string;
  links: SavedLink[];
  onClose: () => void;
}) {
  const link = links.find((l) => l.id === linkId);
  if (!link) {
    return (
      <div className="nk-empty nk-empty--center">
        <p>Link not found.</p>
        <div className="nk-empty-cta-row">
          <button className="nk-empty-cta" onClick={onClose}>
            <X size={14} aria-hidden /> Close tab
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="nk-tab-detail">
      <div className="nk-tab-detail-header">
        <span className="nk-tab-detail-type">
          <ExternalLink size={13} aria-hidden /> Link
        </span>
      </div>
      <h1 className="nk-tab-detail-title">{link.title || link.url}</h1>
      {link.description && (
        <p className="nk-tab-detail-desc">{link.description}</p>
      )}
      <a
        className="nk-tab-detail-url"
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {link.url}
      </a>
      {link.tags.length > 0 && (
        <div className="nk-tab-detail-tags">
          {link.tags.map((t) => (
            <span key={t} className="nk-tag">{t}</span>
          ))}
        </div>
      )}
      <div className="nk-tab-detail-actions">
        <a
          className="nk-btn nk-btn--primary"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={14} aria-hidden /> Open in browser
        </a>
      </div>
    </div>
  );
}

function SecretTabView({
  vault,
  name,
  onClose,
}: {
  vault: string;
  name: string;
  onClose: () => void;
}) {
  return (
    <div className="nk-tab-detail">
      <div className="nk-tab-detail-header">
        <span className="nk-tab-detail-type">
          <Shield size={13} aria-hidden /> Secret
        </span>
      </div>
      <h1 className="nk-tab-detail-title">{name}</h1>
      {vault && (
        <p className="nk-tab-detail-desc" style={{ fontSize: 12, color: "var(--muted)" }}>
          Vault: {vault}
        </p>
      )}
      <div className="nk-tab-detail-actions">
        <button
          className="nk-btn nk-btn--primary"
          onClick={() => {
            /* navigate to secrets surface — handled at app level in future */
            onClose();
          }}
        >
          <Shield size={14} aria-hidden /> Open in Secrets
        </button>
      </div>
    </div>
  );
}
