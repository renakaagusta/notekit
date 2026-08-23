import type { Editor as TipTapEditor } from "@tiptap/react";
import { CaseSensitive, ChevronDown, ChevronUp, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
  clearNoteSearch,
  getNoteSearchInfo,
  nextNoteSearchMatch,
  prevNoteSearchMatch,
  setNoteSearch,
} from "./extensions/SearchHighlight";

/** Seed for the find input: the current single-line selection, or empty. */
export function noteSearchSeed(editor: TipTapEditor): string {
  const { from, to } = editor.state.selection;
  const selected = from !== to ? editor.state.doc.textBetween(from, to, " ").trim() : "";
  return selected && !selected.includes("\n") ? selected : "";
}

interface NoteSearchBarProps {
  /** Resolved lazily (in effects/handlers) so the editor ref isn't read during render. */
  getEditor: () => TipTapEditor | null;
  initialTerm: string;
  onClose(): void;
}

interface NoteSearchControlsProps {
  count: number;
  caseSensitive: boolean;
  onToggleCase(): void;
  onPrev(): void;
  onNext(): void;
  onClose(): void;
}

function NoteSearchControls({
  count,
  caseSensitive,
  onToggleCase,
  onPrev,
  onNext,
  onClose,
}: NoteSearchControlsProps) {
  return (
    <>
      <button
        className={"nk-note-search-btn" + (caseSensitive ? " is-active" : "")}
        title="Match case"
        aria-label="Match case"
        aria-pressed={caseSensitive}
        onClick={onToggleCase}
      >
        <CaseSensitive size={15} aria-hidden />
      </button>
      <button
        className="nk-note-search-btn"
        title="Previous match (⇧⏎)"
        aria-label="Previous match"
        disabled={count === 0}
        onClick={onPrev}
      >
        <ChevronUp size={15} aria-hidden />
      </button>
      <button
        className="nk-note-search-btn"
        title="Next match (⏎)"
        aria-label="Next match"
        disabled={count === 0}
        onClick={onNext}
      >
        <ChevronDown size={15} aria-hidden />
      </button>
      <button
        className="nk-note-search-btn"
        title="Close (Esc)"
        aria-label="Close find"
        onClick={onClose}
      >
        <X size={15} aria-hidden />
      </button>
    </>
  );
}

/**
 * In-note find bar. Opens over the top-right of the editor, highlights every
 * match, and steps through them with Enter / Shift+Enter (or the arrows).
 * Escape closes and clears the highlight. Seeded with the current selection.
 */
export function NoteSearchBar({ getEditor, initialTerm, onClose }: NoteSearchBarProps) {
  const [term, setTerm] = useState(initialTerm);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [info, setInfo] = useState({ count: 0, current: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  // Prime the highlight with the seed term and focus the input on open.
  useEffect(() => {
    const editor = getEditor();
    if (!editor) return;
    setNoteSearch(editor, initialTerm, false);
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      const ed = getEditor();
      if (ed) clearNoteSearch(ed);
    };
  }, [getEditor, initialTerm]);

  // Re-read match counts whenever the editor transacts (search state lives in a
  // ProseMirror plugin, not React state).
  useEffect(() => {
    const editor = getEditor();
    if (!editor) return;
    const sync = () => setInfo(getNoteSearchInfo(editor));
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [getEditor]);

  function apply(nextTerm: string, nextCase: boolean) {
    const editor = getEditor();
    if (editor) setNoteSearch(editor, nextTerm, nextCase);
  }

  function onTermChange(value: string) {
    setTerm(value);
    apply(value, caseSensitive);
  }

  function toggleCase() {
    const next = !caseSensitive;
    setCaseSensitive(next);
    apply(term, next);
  }

  function step(delta: 1 | -1) {
    const editor = getEditor();
    if (!editor) return;
    if (delta === 1) nextNoteSearchMatch(editor);
    else prevNoteSearchMatch(editor);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="nk-note-search" role="search">
      <input
        ref={inputRef}
        className="nk-note-search-input"
        type="text"
        placeholder="Find in note…"
        value={term}
        onChange={(e) => onTermChange(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Find in note"
      />
      <span className="nk-note-search-count" aria-live="polite">
        {term.length > 0 ? (info.count > 0 ? `${info.current}/${info.count}` : "0/0") : ""}
      </span>
      <NoteSearchControls
        count={info.count}
        caseSensitive={caseSensitive}
        onToggleCase={toggleCase}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onClose={onClose}
      />
    </div>
  );
}
