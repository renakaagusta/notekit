import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { useMemo } from "react";
import { journalYMDFromPath } from "../lib/journal";
import { noteTitle, notePreview } from "../lib/note-display";
import { useLayoutStore } from "../stores/layoutStore";
import { useNotesStore } from "../stores/notesStore";

/**
 * The contents of a notes folder rendered as a pane tab: immediate subfolders
 * (which open their own folder tab) followed by the notes filed directly in it
 * (which open as note tabs). Opening a folder here mirrors clicking it in the
 * sidebar tree — same open-in-pane behaviour.
 */
export function FolderDetail({ path, paneId }: { path: string; paneId: string }) {
  const all = useNotesStore((s) => s.all());
  const folders = useNotesStore((s) => s.folders);

  const label = path.split("/").filter(Boolean).pop() || "Folder";

  const { subfolders, notes } = useMemo(() => {
    const prefix = path ? `${path}/` : "";
    // Immediate child folders: those one segment deeper than `path`.
    const childSet = new Set<string>();
    for (const f of folders) {
      if (!f.startsWith(prefix) || f === path) continue;
      const rest = f.slice(prefix.length);
      const first = rest.split("/")[0];
      if (first) childSet.add(prefix + first);
    }
    // Folders can also be implied purely by a note's folder path.
    for (const n of all) {
      if (!n.folder || !n.folder.startsWith(prefix) || n.folder === path) continue;
      const rest = n.folder.slice(prefix.length);
      const first = rest.split("/")[0];
      if (first) childSet.add(prefix + first);
    }
    const notesHere = all
      .filter((n) => (n.folder ?? "") === path && !journalYMDFromPath(n.path))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      subfolders: [...childSet].sort((a, b) => a.localeCompare(b)),
      notes: notesHere,
    };
  }, [all, folders, path]);

  const total = subfolders.length + notes.length;

  function openFolder(p: string) {
    useLayoutStore.getState().openTab({ type: "folder", path: p }, paneId);
  }
  function openNote(id: string) {
    useLayoutStore.getState().openNote(id, paneId);
  }

  return (
    <div className="nk-tab-detail nk-folder-detail nk-tab-detail--fill">
      <div className="nk-tab-detail-header">
        <span className="nk-tab-detail-type">
          <FolderOpen size={13} aria-hidden /> Folder
        </span>
      </div>
      <h1 className="nk-tab-detail-title">{label}</h1>
      <p className="nk-tab-detail-desc" style={{ fontSize: 12, color: "var(--muted)" }}>
        {total === 0
          ? "Empty folder"
          : `${notes.length} note${notes.length === 1 ? "" : "s"}` +
            (subfolders.length ? ` · ${subfolders.length} folder${subfolders.length === 1 ? "" : "s"}` : "")}
      </p>

      <ul className="nk-index-list">
        {subfolders.map((p) => (
          <li key={`f:${p}`}>
            <button className="nk-index-row" onClick={() => openFolder(p)}>
              <Folder size={15} className="nk-index-icon" aria-hidden />
              <span className="nk-index-label">{p.split("/").pop()}</span>
              <ChevronRight size={14} className="nk-index-chevron" aria-hidden />
            </button>
          </li>
        ))}
        {notes.map((n) => {
          const preview = notePreview(n);
          return (
            <li key={n.id}>
              <button className="nk-index-row" onClick={() => openNote(n.id)}>
                <FileText size={15} className="nk-index-icon" aria-hidden />
                <span className="nk-index-stack">
                  <span className="nk-index-label">{noteTitle(n)}</span>
                  {preview && <span className="nk-index-sub">{preview}</span>}
                </span>
                <ChevronRight size={14} className="nk-index-chevron" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
