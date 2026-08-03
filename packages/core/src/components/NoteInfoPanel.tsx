import { useState } from "react";
import { ExternalLink, Link, List, Tag } from "lucide-react";
import { useNotesStore } from "../stores/notesStore";
import { useLayoutStore } from "../stores/layoutStore";
import { noteTitle } from "../lib/note-display";
import type { Note } from "../types/note";

type InfoTab = "backlinks" | "outlinks" | "tags" | "outline";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getBacklinks(notes: Record<string, Note>, currentNote: Note): Array<{
  sourceNote: Note;
  snippets: string[];
}> {
  const title = noteTitle(currentNote);
  if (!title || title === "Untitled") return [];
  const pattern = new RegExp(`\\[\\[${escapeRegex(title)}\\]\\]`, "gi");
  const results: Array<{ sourceNote: Note; snippets: string[] }> = [];
  for (const n of Object.values(notes)) {
    if (n.id === currentNote.id) continue;
    if (!pattern.test(n.body)) continue;
    pattern.lastIndex = 0;
    const lines = n.body.split("\n");
    const matchingLines = lines
      .filter((l) => pattern.test(l))
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 2);
    pattern.lastIndex = 0;
    if (matchingLines.length > 0) results.push({ sourceNote: n, snippets: matchingLines });
  }
  return results;
}

function getOutlinks(body: string): string[] {
  const matches: string[] = [];
  const pattern = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    const target = (m[1] ?? "").trim();
    if (target && !matches.includes(target)) matches.push(target);
  }
  return matches;
}

function getOutlineHeadings(body: string): Array<{ level: number; text: string }> {
  return body
    .split("\n")
    .map((line) => {
      const m = line.match(/^(#{1,6})\s+(.+)/);
      if (!m || !m[1] || !m[2]) return null;
      return { level: m[1].length, text: m[2].trim() };
    })
    .filter((h): h is { level: number; text: string } => h !== null);
}

function SnippetHighlight({ text, titleToHighlight }: { text: string; titleToHighlight: string }) {
  const pattern = new RegExp(`(\\[\\[${escapeRegex(titleToHighlight)}\\]\\])`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <mark key={i} className="nk-backlink-highlight">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

interface Props {
  noteId: string | null;
}

export function NoteInfoPanel({ noteId }: Props) {
  const [activeTab, setActiveTab] = useState<InfoTab>("backlinks");
  const notes = useNotesStore((s) => s.notes);
  const openNote = useLayoutStore((s) => s.openNote);
  const activePaneId = useLayoutStore((s) => s.activePaneId);

  const note = noteId ? notes[noteId] ?? null : null;

  const TABS: { id: InfoTab; icon: React.ReactNode; label: string }[] = [
    { id: "backlinks", icon: <Link size={14} aria-hidden />, label: "Backlinks" },
    { id: "outlinks", icon: <ExternalLink size={14} aria-hidden />, label: "Links" },
    { id: "tags", icon: <Tag size={14} aria-hidden />, label: "Tags" },
    { id: "outline", icon: <List size={14} aria-hidden />, label: "Outline" },
  ];

  function openNoteById(id: string) {
    openNote(id, activePaneId ?? "");
  }

  function renderBacklinks() {
    if (!note) return <p className="nk-info-empty">No note open</p>;
    const backlinks = getBacklinks(notes, note);
    if (backlinks.length === 0)
      return <p className="nk-info-empty">No linked mentions found</p>;
    return (
      <>
        {backlinks.map(({ sourceNote, snippets }) => (
          <div key={sourceNote.id} className="nk-backlink-group">
            <div className="nk-backlink-title">
              <span>{noteTitle(sourceNote)}</span>
              <span className="nk-backlink-count">{snippets.length}</span>
            </div>
            {snippets.map((snippet, i) => (
              <div
                key={i}
                className="nk-backlink-snippet"
                onClick={() => openNoteById(sourceNote.id)}
              >
                <SnippetHighlight text={snippet} titleToHighlight={noteTitle(note)} />
              </div>
            ))}
          </div>
        ))}
      </>
    );
  }

  function renderOutlinks() {
    if (!note) return <p className="nk-info-empty">No note open</p>;
    const targets = getOutlinks(note.body);
    if (targets.length === 0) return <p className="nk-info-empty">No outgoing links</p>;
    return (
      <>
        {targets.map((target) => {
          const targetNote = Object.values(notes).find(
            (n) => noteTitle(n).toLowerCase() === target.toLowerCase(),
          );
          return (
            <div
              key={target}
              className={`nk-outlink-item${targetNote ? "" : " nk-outlink-item--unresolved"}`}
              onClick={() => targetNote && openNoteById(targetNote.id)}
              style={{ cursor: targetNote ? "pointer" : "default" }}
            >
              <ExternalLink size={13} aria-hidden style={{ flexShrink: 0, marginTop: 2, opacity: 0.5 }} />
              <div>
                <div className="nk-outlink-title">{target}</div>
                {targetNote?.folder && (
                  <div className="nk-outlink-folder">{targetNote.folder}</div>
                )}
                {!targetNote && (
                  <div className="nk-outlink-folder" style={{ fontStyle: "italic" }}>
                    unresolved
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  function renderTags() {
    if (!note) return <p className="nk-info-empty">No note open</p>;
    if (!note.tags || note.tags.length === 0)
      return <p className="nk-info-empty">No tags on this note</p>;
    return (
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        {note.tags.map((tag) => (
          <span key={tag} className="nk-tag-chip">
            <Tag size={10} aria-hidden />
            {tag}
          </span>
        ))}
      </div>
    );
  }

  function renderOutline() {
    if (!note) return <p className="nk-info-empty">No note open</p>;
    const headings = getOutlineHeadings(note.body);
    if (headings.length === 0) return <p className="nk-info-empty">No headings found</p>;
    return (
      <>
        {headings.map((h, i) => (
          <button
            key={i}
            className={`nk-outline-item nk-outline-h${Math.min(h.level, 3)}`}
          >
            {h.text}
          </button>
        ))}
      </>
    );
  }

  return (
    <div className="nk-info-panel">
      <div className="nk-info-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`nk-info-tab${activeTab === tab.id ? " nk-info-tab--active" : ""}`}
            title={tab.label}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
          </button>
        ))}
      </div>
      <div className="nk-info-body" role="tabpanel">
        {activeTab === "backlinks" && renderBacklinks()}
        {activeTab === "outlinks" && renderOutlinks()}
        {activeTab === "tags" && renderTags()}
        {activeTab === "outline" && renderOutline()}
      </div>
    </div>
  );
}
