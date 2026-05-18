import { useEffect, useRef, useState } from "react";
import type { Editor as TipTapEditor } from "@tiptap/react";
import {
  ChevronDown as LucideChevronDown,
  History as LucideHistory,
  Image as LucideImage,
  ListChecks,
  Redo2,
  Table as LucideTable,
  Undo2,
} from "lucide-react";
import {
  type Heading,
  setHeading,
  toggleBold,
  toggleItalic,
  insertChecklist,
  insertTable,
  insertImage,
  undo,
  redo,
} from "../lib/editor-commands";

interface EditorToolbarProps {
  getEditor(): TipTapEditor | null;
  onHistoryClick?(): void;
}

export function EditorToolbar({ getEditor, onHistoryClick }: EditorToolbarProps) {
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
        title="Note history"
        aria-label="Note history"
        onClick={onHistoryClick}
      >
        <HistoryIcon />
      </button>
    </div>
  );
}

const ChecklistIcon = () => <ListChecks size={16} aria-hidden />;
const TableIcon = () => <LucideTable size={16} aria-hidden />;
const ImageIcon = () => <LucideImage size={16} aria-hidden />;
const ChevronDown = () => <LucideChevronDown size={10} aria-hidden />;
const UndoIcon = () => <Undo2 size={16} aria-hidden />;
const RedoIcon = () => <Redo2 size={16} aria-hidden />;
const HistoryIcon = () => <LucideHistory size={16} aria-hidden />;
