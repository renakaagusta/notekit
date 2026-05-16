import { useEffect, useRef, useState } from "react";
import type { Editor as TipTapEditor } from "@tiptap/react";
import {
  type Heading,
  setHeading,
  toggleBold,
  toggleItalic,
  insertChecklist,
  insertTable,
  insertImage,
  insertLink,
  undo,
  redo,
} from "../lib/editor-commands";

interface EditorToolbarProps {
  getEditor(): TipTapEditor | null;
}

export function EditorToolbar({ getEditor }: EditorToolbarProps) {
  const [aaOpen, setAaOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [, setTick] = useState(0);
  const aaRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (aaRef.current && !aaRef.current.contains(target)) setAaOpen(false);
      if (imageRef.current && !imageRef.current.contains(target)) {
        setImageOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const editor = getEditor();
  useEffect(() => {
    if (!editor) return;
    const onChange = () => setTick((t) => t + 1);
    editor.on("transaction", onChange);
    return () => {
      editor.off("transaction", onChange);
    };
  }, [editor]);

  const canUndo = editor?.can().undo() ?? false;
  const canRedo = editor?.can().redo() ?? false;

  function run(fn: (e: TipTapEditor) => void) {
    const editor = getEditor();
    if (editor) fn(editor);
  }

  function applyHeading(kind: Heading) {
    setAaOpen(false);
    run((e) => setHeading(e, kind));
  }

  function applyImage() {
    if (!imageUrl.trim()) return;
    setImageOpen(false);
    const url = imageUrl.trim();
    setImageUrl("");
    run((e) => insertImage(e, url));
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setImageOpen(false);
      run((ed) => insertImage(ed, url, file.name));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="nk-toolbar" role="toolbar" aria-label="Formatting">
      <button
        className="nk-tb-btn"
        title="Undo (⌘Z)"
        aria-label="Undo"
        disabled={!canUndo}
        onClick={() => run(undo)}
      >
        <UndoIcon />
      </button>
      <button
        className="nk-tb-btn"
        title="Redo (⌘⇧Z)"
        aria-label="Redo"
        disabled={!canRedo}
        onClick={() => run(redo)}
      >
        <RedoIcon />
      </button>
      <div className="nk-tb-divider" aria-hidden="true" />
      <div className="nk-toolbar-group" ref={aaRef}>
        <button
          className="nk-tb-btn"
          title="Text style"
          aria-label="Text style"
          aria-expanded={aaOpen}
          onClick={() => setAaOpen((x) => !x)}
        >
          <span className="nk-tb-aa">Aa</span>
        </button>
        {aaOpen && (
          <div className="nk-tb-menu">
            <button onClick={() => applyHeading("h1")}>
              <span className="nk-tb-h1">Title</span>
            </button>
            <button onClick={() => applyHeading("h2")}>
              <span className="nk-tb-h2">Heading</span>
            </button>
            <button onClick={() => applyHeading("h3")}>
              <span className="nk-tb-h3">Subheading</span>
            </button>
            <button onClick={() => applyHeading("body")}>
              <span>Body</span>
            </button>
            <div className="nk-tb-sep" />
            <button onClick={() => { setAaOpen(false); run(toggleBold); }}>
              <b>Bold</b>
            </button>
            <button onClick={() => { setAaOpen(false); run(toggleItalic); }}>
              <i>Italic</i>
            </button>
          </div>
        )}
      </div>

      <button
        className="nk-tb-btn"
        title="Checklist"
        aria-label="Checklist"
        onClick={() => run(insertChecklist)}
      >
        <ChecklistIcon />
      </button>

      <button
        className="nk-tb-btn"
        title="Table"
        aria-label="Table"
        onClick={() => run(insertTable)}
      >
        <TableIcon />
      </button>

      <div className="nk-toolbar-group" ref={imageRef}>
        <button
          className="nk-tb-btn"
          title="Image"
          aria-label="Image"
          aria-expanded={imageOpen}
          onClick={() => setImageOpen((x) => !x)}
        >
          <ImageIcon />
          <ChevronDown />
        </button>
        {imageOpen && (
          <div className="nk-tb-menu nk-tb-menu--wide">
            <button
              className="nk-tb-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose from computer…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={onPickFile}
            />
            <div className="nk-tb-sep" />
            <label className="nk-tb-field">
              <span>Or paste an image URL</span>
              <input
                type="url"
                placeholder="https://…"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyImage();
                }}
              />
            </label>
            <button className="nk-tb-btn" onClick={applyImage}>
              Insert from URL
            </button>
          </div>
        )}
      </div>

      <div className="nk-toolbar-spacer" />

      <button
        className="nk-tb-btn"
        title="Link"
        aria-label="Link"
        onClick={() => {
          const url = window.prompt("Link URL");
          if (url) run((e) => insertLink(e, url));
        }}
      >
        <LinkIcon />
      </button>
    </div>
  );
}

function ChecklistIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="4" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.7 4.2l1 1L5.5 3.3"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M8 4h6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="4" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 12h6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M1.5 6.5h13M1.5 10.5h13M5.5 2.5v11M10.5 2.5v11"
        stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="5.5" cy="6" r="1.3" fill="currentColor" />
      <path
        d="M2.5 13l3.5-4 3 3 2-2 4 3"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
      <path
        d="M2 4l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 4L2.5 7L6 10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 7H10a3.5 3.5 0 010 7H7"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M10 4l3.5 3L10 10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 7H6a3.5 3.5 0 000 7h3"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6.5 9.5l3-3M5 11a2.5 2.5 0 010-3.5l2-2a2.5 2.5 0 013.5 3.5l-.5.5M11 5a2.5 2.5 0 010 3.5l-2 2a2.5 2.5 0 01-3.5-3.5l.5-.5"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
