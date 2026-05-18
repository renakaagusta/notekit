import { useEffect, useRef } from "react";
import { FileText, Folder } from "lucide-react";
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
        <FileText size={14} aria-hidden />
        <span>New file</span>
      </button>
      <button className="nk-popover-item" role="menuitem" onClick={onNewFolder}>
        <Folder size={14} aria-hidden />
        <span>New folder</span>
      </button>
    </div>
  );
}
