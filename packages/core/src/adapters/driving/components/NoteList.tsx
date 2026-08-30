import {
  ArrowDownAZ,
  ArrowUpDown,
  Check,
  ChevronRight,
  ChevronsDownUp,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Lock,
  MoreHorizontal,
} from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Note } from "../../../domain/entities/note";
import { journalYMDFromPath } from "../../../domain/journal";
import { noteTitle, notePreview } from "../../../domain/note-display";
import { useMediaQuery, MOBILE_BREAKPOINT } from "../hooks/useMediaQuery";
import { useCryptoStore } from "../stores/cryptoStore";
import { useLayoutStore } from "../stores/layoutStore";
import { useNotesStore } from "../stores/notesStore";
import { useSyncStore } from "../stores/syncStore";
import { useVaultStore } from "../stores/vaultStore";
import { useConfirm } from "./useConfirm";

type SortMode =
  | "alpha-asc"
  | "alpha-desc"
  | "modified-desc"
  | "modified-asc"
  | "created-desc"
  | "created-asc";

const DEFAULT_SORT: SortMode = "modified-desc";

/** Sort options, grouped for the dropdown (a divider between groups). */
const SORT_GROUPS: { mode: SortMode; label: string }[][] = [
  [
    { mode: "alpha-asc", label: "File name (A to Z)" },
    { mode: "alpha-desc", label: "File name (Z to A)" },
  ],
  [
    { mode: "modified-desc", label: "Modified time (new to old)" },
    { mode: "modified-asc", label: "Modified time (old to new)" },
  ],
  [
    { mode: "created-desc", label: "Created time (new to old)" },
    { mode: "created-asc", label: "Created time (old to new)" },
  ],
];

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  notes: Note[];
}

function allFolderPaths(node: FolderNode): string[] {
  return [
    ...(node.path ? [node.path] : []),
    ...node.children.flatMap(allFolderPaths),
  ];
}

function buildTree(notes: Note[], extraFolders: string[], sort: SortMode): FolderNode {
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

  const applySort = (node: FolderNode) => {
    // Folders sort by name (descending only under "Z to A"); time sorts leave
    // folders A→Z since a folder has no single timestamp.
    node.children.sort((a, b) =>
      sort === "alpha-desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
    );
    switch (sort) {
      case "alpha-asc":
        node.notes.sort((a, b) => noteTitle(a).localeCompare(noteTitle(b)));
        break;
      case "alpha-desc":
        node.notes.sort((a, b) => noteTitle(b).localeCompare(noteTitle(a)));
        break;
      case "modified-asc":
        node.notes.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
        break;
      case "created-desc":
        node.notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "created-asc":
        node.notes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        break;
      case "modified-desc":
      default:
        node.notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        break;
    }
    node.children.forEach(applySort);
  };
  applySort(root);
  return root;
}

// eslint-disable-next-line max-lines-per-function, complexity, sonarjs/cognitive-complexity -- file-tree component with drag-and-drop, context menus, folder management, sorting, and multiple interaction modes; render helpers extracted where possible
export function NoteList({
  mobileShell = false,
}: {
  mobileShell?: boolean;
  /** Retained for call-site compatibility; the hide-sidebar button was removed. */
  onCollapse?: () => void;
}) {
  const all = useNotesStore((s) => s.all());
  const folders = useNotesStore((s) => s.folders);
  const activeNoteId = useNotesStore((s) => s.activeNoteId);
  const setActive = useNotesStore((s) => s.setActive);
  const setFolder = useNotesStore((s) => s.setFolder);
  const remove = useNotesStore((s) => s.remove);
  const removeFolder = useNotesStore((s) => s.removeFolder);
  const upsert = useNotesStore((s) => s.upsert);
  const createFolder = useNotesStore((s) => s.createFolder);
  const encryptionRequired = useCryptoStore((s) => s.encryptionRequired);
  // Content is decrypted a beat after boot (crypto bootstrap → cache/network
  // decrypt). Until then note bodies are empty and noteTitle() returns
  // "Untitled". Show a skeleton bar for those instead of the stale placeholder.
  const contentReady = useSyncStore((s) => s.contentReady);
  const vaultReady = useVaultStore((s) => s.phase === "ready");

  const { confirm, confirmDialog } = useConfirm();
  const [sortMode, setSortMode] = useState<SortMode>(DEFAULT_SORT);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);

  function createNewFile(parent: string | null) {
    const note = upsert({ title: "Untitled", body: "", folder: parent });
    setActive(note.id);
  }

  function createNewFolder(parent: string | null) {
    const name = window.prompt("Folder name:");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const full = parent ? `${parent}/${trimmed}` : trimmed;
    createFolder(full);
  }

  const nonJournalNotes = useMemo(
    () => all.filter((n) => !journalYMDFromPath(n.path)),
    [all],
  );
  const tree = useMemo(
    () => buildTree(nonJournalNotes, folders, sortMode),
    [nonJournalNotes, folders, sortMode],
  );

  useEffect(() => {
    if (!sortMenuOpen) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Element | null;
      // Keep open for clicks on the trigger or inside the (mobile) sheet body;
      // the sheet backdrop closes itself.
      if (t?.closest(".nk-tree-tb-sort, .nk-sort-menu, .nk-sort-sheet")) return;
      setSortMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [sortMenuOpen]);

  function collapseAll() {
    setCollapsed(new Set(allFolderPaths(tree)));
  }

  function expandAll() {
    setCollapsed(new Set());
  }

  const allCollapsed = useMemo(() => {
    const paths = allFolderPaths(tree);
    return paths.length > 0 && paths.every((p) => collapsed.has(p));
  }, [tree, collapsed]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
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

  async function onDeleteNote(note: Note, e: React.MouseEvent) {
    e.stopPropagation();
    const confirmed = await confirm({
      title: `Delete "${noteTitle(note)}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
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

  async function onDeleteFolder(folderPath: string, e: React.MouseEvent) {
    e.stopPropagation();
    const inside = all.filter(
      (n) => n.folder === folderPath || n.folder?.startsWith(`${folderPath}/`),
    );
    const description =
      inside.length > 0
        ? `This will also delete ${inside.length} note${inside.length === 1 ? "" : "s"} inside it.`
        : undefined;
    const confirmed = await confirm({
      title: `Delete folder "${folderPath}"?`,
      description,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!confirmed) return;
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

  const SortIcon = sortMode === "alpha-asc" ? ArrowDownAZ : ArrowUpDown;

  const toolbar = !mobileShell && (
    <div className="nk-tree-toolbar">
      <button
        className="nk-tree-tb-btn"
        title={vaultReady ? "New note" : "Set up a vault first"}
        aria-label="New note"
        onClick={() => vaultReady && createNewFile(null)}
        disabled={!vaultReady}
      >
        <FilePlus size={17} aria-hidden />
      </button>
      <button
        className="nk-tree-tb-btn"
        title={vaultReady ? "New folder" : "Set up a vault first"}
        aria-label="New folder"
        onClick={() => vaultReady && createNewFolder(null)}
        disabled={!vaultReady}
      >
        <FolderPlus size={17} aria-hidden />
      </button>
      <div className="nk-tree-tb-sort">
        <button
          ref={sortBtnRef}
          className={"nk-tree-tb-btn" + (sortMenuOpen ? " active" : "")}
          title="Sort"
          aria-label="Sort"
          aria-haspopup="menu"
          aria-expanded={sortMenuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setSortMenuOpen((v) => !v);
          }}
        >
          <SortIcon size={17} aria-hidden />
        </button>
        {sortMenuOpen && (
          <SortMenu
            active={sortMode}
            onPick={setSortMode}
            onClose={() => setSortMenuOpen(false)}
            anchorRef={sortBtnRef}
          />
        )}
      </div>
      <button
        className="nk-tree-tb-btn"
        title={allCollapsed ? "Expand all" : "Collapse all"}
        aria-label={allCollapsed ? "Expand all" : "Collapse all"}
        onClick={allCollapsed ? expandAll : collapseAll}
      >
        <ChevronsDownUp size={17} aria-hidden />
      </button>
    </div>
  );

  if (isEmpty) {
    return (
      <>
        {toolbar}
        <div className="nk-empty nk-empty--center">
          {vaultReady ? (
            <>
              <p>No notes yet.</p>
              <p className="nk-empty-hint">
                {mobileShell ? "Tap + to create one." : "Press ⌘N to create one."}
              </p>
            </>
          ) : (
            <>
              <p>No vault set up.</p>
              <p className="nk-empty-hint">Connect a vault to start syncing notes.</p>
            </>
          )}
        </div>
      </>
    );
  }

  // All guide positions for items at a given effective depth D:
  // depths 1..D each get a guide line at 8 + (d-1)*16 + 7
  function guidesFor(d: number) {
    return Array.from({ length: d }, (_, i) => 8 + i * 16 + 7);
  }

  function renderFolderRow(node: FolderNode, depth: number): React.ReactElement {
    const isCollapsed = collapsed.has(node.path);
    const dropClass = dropTarget === node.path ? " drop" : "";
    const guides = guidesFor(depth);
    return (
      <li
        key={`folder:${node.path}`}
        className={`nk-tree-item nk-tree-item--folder${dropClass}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => useLayoutStore.getState().openTab({ type: "folder", path: node.path })}
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
        {guides.map((x) => <span key={x} className="nk-guide" style={{ left: x }} aria-hidden />)}
        <span
          className={"nk-disclosure" + (isCollapsed ? "" : " open")}
          onClick={(e) => {
            e.stopPropagation();
            toggle(node.path);
          }}
          aria-hidden
        >
          <ChevronRight size={12} />
        </span>
        <Folder size={14} className="nk-tree-icon" aria-hidden />
        <span className="nk-tree-label">{node.name}</span>
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
            <MoreHorizontal size={12} aria-hidden />
          </button>
          {ctxMenu === `folder:${node.path}` && (
            <TreeContextMenu
              onClose={() => setCtxMenu(null)}
              items={[
                {
                  label: "New file",
                  onClick: () => createNewFile(node.path),
                },
                {
                  label: "New folder",
                  onClick: () => createNewFolder(node.path),
                },
                {
                  label: "Delete folder",
                  danger: true,
                  onClick: (e) => onDeleteFolder(node.path, e),
                },
              ]}
            />
          )}
        </span>
      </li>
    );
  }

  function renderNoteCtxWrap(n: Note): React.ReactElement {
    return (
      <span className="nk-tree-ctx-wrap">
        <button
          className="nk-tree-ctx-btn"
          title="More options"
          aria-label="More options"
          onClick={(e) => {
            e.stopPropagation();
            setCtxMenu((cur) => (cur === `note:${n.id}` ? null : `note:${n.id}`));
          }}
        >
          <MoreHorizontal size={12} aria-hidden />
        </button>
        {ctxMenu === `note:${n.id}` && (
          <TreeContextMenu
            onClose={() => setCtxMenu(null)}
            items={[
              { label: "Duplicate", onClick: (e) => onDuplicateNote(n, e) },
              { label: "Delete", danger: true, onClick: (e) => onDeleteNote(n, e) },
            ]}
          />
        )}
      </span>
    );
  }

  function renderNoteRow(n: Note, childDepth: number): React.ReactElement {
    const title = noteTitle(n);
    const preview = notePreview(n);
    const noteGuides = guidesFor(childDepth);
    return (
      <li
        key={n.id}
        draggable
        className={
          "nk-tree-item nk-tree-item--note" +
          (n.id === activeNoteId ? " active" : "")
        }
        style={{ paddingLeft: 8 + childDepth * 16 }}
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
        {noteGuides.map((x) => <span key={x} className="nk-guide" style={{ left: x }} aria-hidden />)}
        <FileText size={14} className="nk-tree-icon" aria-hidden />
        <span className="nk-tree-stack">
          <span className="nk-tree-label">
            {n.encrypted && !encryptionRequired && (
              <Lock size={11} strokeWidth={2} aria-label="Encrypted" className="nk-tree-lock" />
            )}
            {!contentReady && !n.body ? (
              <span className="nk-tree-skel" aria-label="Loading" />
            ) : (
              title
            )}
          </span>
          {preview && <span className="nk-tree-sub" aria-hidden>{preview}</span>}
        </span>
        {renderNoteCtxWrap(n)}
      </li>
    );
  }

  function renderNode(node: FolderNode, depth: number): React.ReactElement[] {
    const isCollapsed = collapsed.has(node.path);
    const isRoot = node.path === "";
    const rows: React.ReactElement[] = [];

    if (!isRoot) {
      rows.push(renderFolderRow(node, depth));
    }

    if (isCollapsed && !isRoot) return rows;

    const childDepth = isRoot ? depth : depth + 1;
    for (const c of node.children) rows.push(...renderNode(c, childDepth));
    for (const n of node.notes) rows.push(renderNoteRow(n, childDepth));

    return rows;
  }

  return (
    <>
      {confirmDialog}
      {toolbar}
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
    </>
  );
}

interface CtxItem {
  label: string;
  danger?: boolean;
  onClick(e: React.MouseEvent): void;
}

/**
 * Sort picker — a dropdown on desktop, a bottom sheet on mobile (narrow screens).
 * Grouped options (file name / modified / created) with a check on the active one.
 */
function SortMenu({
  active,
  onPick,
  onClose,
  anchorRef,
}: {
  active: SortMode;
  onPick(mode: SortMode): void;
  onClose(): void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const isMobile = useMediaQuery(MOBILE_BREAKPOINT);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (isMobile) return;
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 248;
    setPos({
      top: r.bottom + 4,
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
    });
  }, [isMobile, anchorRef]);
  const options = SORT_GROUPS.map((group, gi) => (
    <Fragment key={gi}>
      {gi > 0 && <li className="nk-sort-sep" role="separator" />}
      {group.map((opt) => (
        <li key={opt.mode} role="none">
          <button
            role="menuitemradio"
            aria-checked={active === opt.mode}
            className={"nk-sort-item" + (active === opt.mode ? " is-active" : "")}
            onClick={(e) => {
              e.stopPropagation();
              onPick(opt.mode);
              onClose();
            }}
          >
            <Check size={16} className="nk-sort-check" aria-hidden />
            <span>{opt.label}</span>
          </button>
        </li>
      ))}
    </Fragment>
  ));

  if (isMobile) {
    return (
      <div className="nk-sort-sheet-backdrop" onMouseDown={onClose}>
        <div className="nk-sort-sheet" onMouseDown={(e) => e.stopPropagation()}>
          <div className="nk-sort-sheet-grip" aria-hidden />
          <div className="nk-sort-sheet-ttl">Sort by</div>
          <ul className="nk-sort-list" role="menu">
            {options}
          </ul>
        </div>
      </div>
    );
  }
  if (!pos) return null;
  // Portal to body so the dropdown escapes the sidebar's overflow clipping.
  return createPortal(
    <ul
      className="nk-ctx-menu nk-sort-menu"
      role="menu"
      style={{ position: "fixed", top: pos.top, left: pos.left, right: "auto" }}
    >
      {options}
    </ul>,
    document.body,
  );
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

