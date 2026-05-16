import { useEffect, useMemo, useRef, useState } from "react";
import { useNotesStore } from "../stores/notesStore";
import { noteTitle, notePreview } from "../lib/note-display";
import type { Note } from "../types/note";
import { CreateMenu } from "./CreateMenu";

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  notes: Note[];
}

function buildTree(notes: Note[], extraFolders: string[]): FolderNode {
  const root: FolderNode = { name: "", path: "", children: [], notes: [] };
  const byPath = new Map<string, FolderNode>();
  byPath.set("", root);

  function ensure(folderPath: string): FolderNode {
    const parts = folderPath.split("/").filter(Boolean);
    let cur = root;
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      let child = byPath.get(acc);
      if (!child) {
        child = { name: part, path: acc, children: [], notes: [] };
        cur.children.push(child);
        byPath.set(acc, child);
      }
      cur = child;
    }
    return cur;
  }

  for (const fp of extraFolders) ensure(fp);
  for (const n of notes) {
    if (!n.folder) {
      root.notes.push(n);
      continue;
    }
    const parent = ensure(n.folder);
    parent.notes.push(n);
  }

  const sort = (node: FolderNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    node.children.forEach(sort);
  };
  sort(root);
  return root;
}

export function NoteList() {
  const all = useNotesStore((s) => s.all());
  const folders = useNotesStore((s) => s.folders);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const setActive = useNotesStore((s) => s.setActive);
  const setFolder = useNotesStore((s) => s.setFolder);
  const remove = useNotesStore((s) => s.remove);
  const removeFolder = useNotesStore((s) => s.removeFolder);
  const upsert = useNotesStore((s) => s.upsert);

  const tree = useMemo(() => buildTree(all, folders), [all, folders]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<string | null>(null);

  function toggle(path: string) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function onDropTo(folderPath: string | null) {
    if (!dragId) return;
    setFolder(dragId, folderPath);
    setDragId(null);
    setDropTarget(null);
  }

  function promptMove(note: Note, e: React.MouseEvent) {
    e.stopPropagation();
    const next = window.prompt(
      "Move to folder (use / for nesting, empty for root):",
      note.folder ?? "",
    );
    if (next === null) return;
    setFolder(note.id, next.trim() || null);
  }

  function onDeleteNote(note: Note, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${noteTitle(note)}"?`)) return;
    setCtxMenu(null);
    remove(note.id);
  }

  function onDuplicateNote(note: Note, e: React.MouseEvent) {
    e.stopPropagation();
    setCtxMenu(null);
    const copy = upsert({
      title: `${noteTitle(note)} (copy)`,
      body: note.body,
      folder: note.folder ?? undefined,
    });
    setActive(copy.id);
  }

  function onDeleteFolder(folderPath: string, e: React.MouseEvent) {
    e.stopPropagation();
    const inside = all.filter(
      (n) => n.folder === folderPath || n.folder?.startsWith(`${folderPath}/`),
    );
    const msg =
      inside.length > 0
        ? `Delete folder "${folderPath}" and its ${inside.length} note${inside.length === 1 ? "" : "s"}?`
        : `Delete folder "${folderPath}"?`;
    if (!confirm(msg)) return;
    setCtxMenu(null);
    inside.forEach((n) => remove(n.id));
    removeFolder(folderPath);
  }

  useEffect(() => {
    if (!ctxMenu) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Element | null;
      if (t?.closest(".nk-tree-ctx-wrap")) return;
      setCtxMenu(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [ctxMenu]);

  const isEmpty = all.length === 0 && folders.length === 0;
  if (isEmpty) {
    return (
      <div className="nk-empty">
        <p>No notes yet.</p>
        <p className="nk-empty-hint">Press ⌘N to create one.</p>
      </div>
    );
  }

  function renderNode(node: FolderNode, depth: number): React.ReactElement[] {
    const isCollapsed = collapsed.has(node.path);
    const dropClass = dropTarget === node.path ? " drop" : "";
    const isRoot = node.path === "";
    const rows: React.ReactElement[] = [];

    if (!isRoot) {
      const isMenuOpen = menuFor === node.path;
      const guideLeft = depth > 0 ? 8 + (depth - 1) * 16 + 7 : undefined;
      rows.push(
        <li
          key={`folder:${node.path}`}
          className={`nk-tree-item nk-tree-item--folder${dropClass}`}
          style={{
            paddingLeft: 8 + depth * 16,
            ...(guideLeft !== undefined
              ? ({ "--nk-guide": `${guideLeft}px` } as React.CSSProperties)
              : {}),
          }}
          onClick={() => toggle(node.path)}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            e.stopPropagation();
            setDropTarget(node.path);
          }}
          onDragLeave={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && e.currentTarget.contains(next)) return;
            if (dropTarget === node.path) setDropTarget(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDropTo(node.path);
          }}
        >
          <span className={"nk-disclosure" + (isCollapsed ? "" : " open")}>
            ▸
          </span>
          <FolderIcon />
          <span className="nk-tree-label">{node.name}</span>
          <span className="nk-tree-count">
            {node.notes.length + node.children.length}
          </span>
          <span className="nk-tree-add-wrap">
            <button
              className="nk-tree-add"
              data-create-toggle
              title="New file or folder"
              aria-label="New file or folder"
              onClick={(e) => {
                e.stopPropagation();
                setMenuFor((cur) => (cur === node.path ? null : node.path));
              }}
            >
              +
            </button>
            {isMenuOpen && (
              <CreateMenu
                parent={node.path}
                onClose={() => setMenuFor(null)}
              />
            )}
          </span>
          <span className="nk-tree-ctx-wrap">
            <button
              className="nk-tree-ctx-btn"
              title="More options"
              aria-label="More options"
              onClick={(e) => {
                e.stopPropagation();
                setCtxMenu((cur) =>
                  cur === `folder:${node.path}` ? null : `folder:${node.path}`,
                );
              }}
            >
              ···
            </button>
            {ctxMenu === `folder:${node.path}` && (
              <TreeContextMenu
                onClose={() => setCtxMenu(null)}
                items={[
                  {
                    label: "Delete folder",
                    danger: true,
                    onClick: (e) => onDeleteFolder(node.path, e),
                  },
                ]}
              />
            )}
          </span>
        </li>,
      );
    }

    if (isCollapsed && !isRoot) return rows;

    const childDepth = isRoot ? depth : depth + 1;
    for (const c of node.children) rows.push(...renderNode(c, childDepth));

    for (const n of node.notes) {
      const title = noteTitle(n);
      const preview = notePreview(n);
      const noteGuideLeft =
        childDepth > 0 ? 8 + (childDepth - 1) * 16 + 7 : undefined;
      rows.push(
        <li
          key={n.id}
          draggable
          className={
            "nk-tree-item nk-tree-item--note" +
            (n.id === activeNoteId ? " active" : "")
          }
          style={{
            paddingLeft: 8 + childDepth * 16,
            ...(noteGuideLeft !== undefined
              ? ({ "--nk-guide": `${noteGuideLeft}px` } as React.CSSProperties)
              : {}),
          }}
          onClick={() => setActive(n.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            promptMove(n, e);
          }}
          onDragStart={(e) => {
            setDragId(n.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", n.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setDropTarget(null);
          }}
        >
          <FileIcon />
          <span className="nk-tree-stack">
            <span className="nk-tree-label">{title}</span>
            {preview && (
              <span className="nk-tree-sub" aria-hidden>
                {preview}
              </span>
            )}
          </span>
          <span className="nk-tree-ctx-wrap">
            <button
              className="nk-tree-ctx-btn"
              title="More options"
              aria-label="More options"
              onClick={(e) => {
                e.stopPropagation();
                setCtxMenu((cur) =>
                  cur === `note:${n.id}` ? null : `note:${n.id}`,
                );
              }}
            >
              ···
            </button>
            {ctxMenu === `note:${n.id}` && (
              <TreeContextMenu
                onClose={() => setCtxMenu(null)}
                items={[
                  {
                    label: "Duplicate",
                    onClick: (e) => onDuplicateNote(n, e),
                  },
                  {
                    label: "Delete",
                    danger: true,
                    onClick: (e) => onDeleteNote(n, e),
                  },
                ]}
              />
            )}
          </span>
        </li>,
      );
    }

    return rows;
  }

  return (
    <ul
      className={"nk-tree" + (dropTarget === "" ? " drop-root" : "")}
      onDragOver={(e) => {
        if (!dragId) return;
        e.preventDefault();
        setDropTarget("");
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropTo(null);
      }}
    >
      {renderNode(tree, 0)}
    </ul>
  );
}

interface CtxItem {
  label: string;
  danger?: boolean;
  onClick(e: React.MouseEvent): void;
}

function TreeContextMenu({
  items,
  onClose,
}: {
  items: CtxItem[];
  onClose(): void;
}) {
  const ref = useRef<HTMLUListElement>(null);
  return (
    <ul className="nk-ctx-menu" ref={ref} role="menu">
      {items.map((item) => (
        <li key={item.label} role="none">
          <button
            role="menuitem"
            className={
              "nk-ctx-menu-item" + (item.danger ? " nk-ctx-menu-item--danger" : "")
            }
            onClick={(e) => {
              e.stopPropagation();
              item.onClick(e);
              onClose();
            }}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

function FileIcon() {
  return (
    <svg
      className="nk-tree-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
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
      className="nk-tree-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <path d="M2 4.5a1 1 0 0 1 1-1h3.4l1.5 1.5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
    </svg>
  );
}
