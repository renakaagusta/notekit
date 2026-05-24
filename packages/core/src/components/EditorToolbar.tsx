import { useEffect, useRef, useState } from "react";
import type { Editor as TipTapEditor } from "@tiptap/react";
import {
  ChevronDown as LucideChevronDown,
  History as LucideHistory,
  Image as LucideImage,
  ListChecks,
  Lock as LucideLock,
  Redo2,
  Table as LucideTable,
  Undo2,
  Unlock as LucideUnlock,
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
import { useNotesStore } from "../stores/notesStore";
import { useVaultStore } from "../stores/vaultStore";
import { useE2eeOnboardingStore } from "../lib/e2ee-onboarding";
import { noteTitle } from "../lib/note-display";

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

  // Encryption controls live on the toolbar rather than as a per-note menu
  // because the encryption decision is fundamentally about *this* note's
  // content — same place a user reaches when they reach for formatting.
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const activeNote = useNotesStore((s) =>
    s.activeNoteId ? s.notes[s.activeNoteId] : undefined,
  );
  const toggleEncryptedAction = useNotesStore((s) => s.toggleEncrypted);
  const vaultId = useVaultStore((s) => s.activeId);
  const requestEncrypt = useE2eeOnboardingStore((s) => s.requestEncrypt);

  function handleToggleEncrypted() {
    if (!activeNote) return;
    // Decrypting is reversible enough to skip the gate — we only intercept
    // the *first* encryption per vault, because that's the irreversible-
    // in-Git-history move that needs explicit acknowledgment.
    if (activeNote.encrypted) {
      toggleEncryptedAction(activeNote.id);
      return;
    }
    if (!vaultId) return;
    requestEncrypt({
      vaultId,
      kind: "note",
      title: noteTitle(activeNote),
      onConfirm: () => toggleEncryptedAction(activeNote.id),
    });
  }

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

      {activeNoteId && activeNote && (
        <button
          className={
            "nk-tb-btn" + (activeNote.encrypted ? " is-encrypted" : "")
          }
          title={
            activeNote.encrypted
              ? "Encrypted — click to decrypt and store as plain markdown"
              : "End-to-end encrypt this note"
          }
          aria-label={
            activeNote.encrypted ? "Decrypt note" : "Encrypt note"
          }
          aria-pressed={!!activeNote.encrypted}
          onClick={handleToggleEncrypted}
        >
          {activeNote.encrypted ? <UnlockIcon /> : <LockIcon />}
        </button>
      )}

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
const LockIcon = () => <LucideLock size={16} aria-hidden />;
const UnlockIcon = () => <LucideUnlock size={16} aria-hidden />;
