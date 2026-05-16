import { useEffect, useRef } from "react";
import { useNotesStore } from "../stores/notesStore";

interface CreateMenuProps {
  parent: string | null;
  onClose(): void;
}

export function CreateMenu({ parent, onClose }: CreateMenuProps) {
  const upsert = useNotesStore((s) => s.upsert);
  const setActive = useNotesStore((s) => s.setActive);
  const createFolder = useNotesStore((s) => s.createFolder);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-create-toggle]")) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function onNewFile() {
    const note = upsert({ title: "Untitled", body: "", folder: parent });
    setActive(note.id);
    onClose();
  }

  function onNewFolder() {
    const name = window.prompt("Folder name:");
    onClose();
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const full = parent ? `${parent}/${trimmed}` : trimmed;
    createFolder(full);
  }

  return (
    <div
      className="nk-popover"
      role="menu"
      ref={ref}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="nk-popover-item" role="menuitem" onClick={onNewFile}>
        <FileIcon />
        <span>New file</span>
      </button>
      <button className="nk-popover-item" role="menuitem" onClick={onNewFolder}>
        <FolderIcon />
        <span>New folder</span>
      </button>
    </div>
  );
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      width="14"
      height="14"
      aria-hidden
    >
      <path d="M3 2.5h6.5L13 6v7.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" />
      <path d="M9.5 2.5V6H13" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      width="14"
      height="14"
      aria-hidden
    >
      <path d="M2 4.5a1 1 0 0 1 1-1h3.4l1.5 1.5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
    </svg>
  );
}
