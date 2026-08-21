import {
  ChevronRight,
  ChevronsDownUp,
  Folder,
  FolderPlus,
  Link2,
  Lock,
  MoreHorizontal,
  MoveRight,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SavedLink } from "../domain/entities/link";
import { detectPlatform, platformLabel } from "../lib/link-platform";
import { useCryptoStore } from "../stores/cryptoStore";
import { useLayoutStore, tabKey, findLeaf } from "../stores/layoutStore";
import { useLinksStore } from "../stores/linksStore";

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  links: SavedLink[];
}

function buildTree(links: SavedLink[], extraFolders: string[]): FolderNode {
  const root: FolderNode = { name: "", path: "", children: [], links: [] };
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
        child = { name: part, path: acc, children: [], links: [] };
        cur.children.push(child);
        byPath.set(acc, child);
      }
      cur = child;
    }
    return cur;
  }

  for (const fp of extraFolders) ensure(fp);
  for (const l of links) {
    if (!l.folder) {
      root.links.push(l);
      continue;
    }
    ensure(l.folder).links.push(l);
  }

  const sort = (node: FolderNode) => {
    node.children.sort((a, b) => a.name.localeCompare(b.name));
    node.links.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    node.children.forEach(sort);
  };
  sort(root);
  return root;
}

/**
 * The Links sidebar list — a folder tree of saved links, mirroring the Notes
 * and Secrets trees. Clicking a link opens it as a tab in the active pane (the
 * detail lives in LinkDetail); clicking a folder opens a LinkFolderDetail index
 * tab. Folder CRUD, drag-into-folder, tag filtering, and adding links happen
 * inline here.
 */
// eslint-disable-next-line max-lines-per-function, complexity -- links tree manages folder CRUD, add form, tag filter, drag-drop, collapse, and per-row menus
export function LinksView({
  mobileShell: _mobileShell = false,
  onOpened,
}: {
  mobileShell?: boolean;
  onOpened?: () => void;
}) {
  const links = useLinksStore((s) => s.all());
  const folders = useLinksStore((s) => s.folders);
  const upsert = useLinksStore((s) => s.upsert);
  const remove = useLinksStore((s) => s.remove);
  const setFolder = useLinksStore((s) => s.setFolder);
  const createFolder = useLinksStore((s) => s.createFolder);
  const removeFolder = useLinksStore((s) => s.removeFolder);
  const encryptionRequired = useCryptoStore((s) => s.encryptionRequired);

  const [addingIn, setAddingIn] = useState<string | null | undefined>(undefined);
  const [addUrl, setAddUrl] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addTags, setAddTags] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<string | null>(null);

  const detectedPlatform = addUrl ? detectPlatform(addUrl) : null;
  const isAdding = addingIn !== undefined;

  // Highlight the link whose tab is active in the focused pane.
  const activeLinkKey = useLayoutStore((s) => {
    const leaf = findLeaf(s.layout, s.activePaneId);
    const t = leaf?.activeTab;
    return t && t.type === "link" ? tabKey(t) : null;
  });

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

  const filtered = useMemo(
    () => (filterTag ? links.filter((l) => l.tags.includes(filterTag)) : links),
    [links, filterTag],
  );
  const tree = useMemo(() => buildTree(filtered, folders), [filtered, folders]);
  const allTags = useMemo(
    () => Array.from(new Set(links.flatMap((l) => l.tags))).sort(),
    [links],
  );

  const allCollapsed = useMemo(() => {
    return folders.length > 0 && folders.every((p) => collapsed.has(p));
  }, [folders, collapsed]);

  function collapseAll() {
    setCollapsed(new Set(folders));
  }
  function expandAll() {
    setCollapsed(new Set());
  }

  function openAddForm(folder: string | null) {
    setAddingIn(folder);
    setAddUrl("");
    setAddTitle("");
    setAddTags("");
    setCtxMenu(null);
    if (folder) {
      setCollapsed((cur) => {
        if (!cur.has(folder)) return cur;
        const next = new Set(cur);
        next.delete(folder);
        return next;
      });
    }
  }

  function onCancel() {
    setAddingIn(undefined);
    setAddUrl("");
    setAddTitle("");
    setAddTags("");
  }

  function openLink(l: SavedLink) {
    useLayoutStore.getState().openTab({ type: "link", id: l.id });
    onOpened?.();
  }

  function openLinkFolder(path: string) {
    useLayoutStore.getState().openTab({ type: "linkfolder", path });
    onOpened?.();
  }

  function onAdd() {
    const url = addUrl.trim();
    if (!url || !isAdding) return;
    const link = upsert({
      url,
      title: addTitle.trim() || undefined,
      tags: parseTags(addTags),
      folder: addingIn ?? null,
    });
    onCancel();
    openLink(link);
  }

  function createNewFolder(parent: string | null) {
    const name = window.prompt("Folder name:");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const full = parent ? `${parent}/${trimmed}` : trimmed;
    createFolder(full);
  }

  function onDeleteFolder(folderPath: string, e: React.MouseEvent) {
    e.stopPropagation();
    const inside = links.filter(
      (l) => l.folder === folderPath || (l.folder ?? "").startsWith(`${folderPath}/`),
    );
    const msg =
      inside.length > 0
        ? `Delete folder "${folderPath}" and its ${inside.length} link${inside.length === 1 ? "" : "s"}?`
        : `Delete folder "${folderPath}"?`;
    if (!confirm(msg)) return;
    setCtxMenu(null);
    inside.forEach((l) => remove(l.id));
    removeFolder(folderPath);
  }

  function promptMove(link: SavedLink) {
    setCtxMenu(null);
    const next = window.prompt(
      "Move to folder (use / for nesting, empty for root):",
      link.folder ?? "",
    );
    if (next === null) return;
    setFolder(link.id, next.trim() || null);
  }

  function onDeleteLink(link: SavedLink) {
    setCtxMenu(null);
    if (!confirm(`Delete "${link.title || link.url}"?`)) return;
    const tab = { type: "link" as const, id: link.id };
    const { layout, activePaneId } = useLayoutStore.getState();
    const leaf = findLeaf(layout, activePaneId);
    if (leaf?.activeTab && tabKey(leaf.activeTab) === tabKey(tab)) {
      useLayoutStore.getState().closeTab(tab, activePaneId);
    }
    remove(link.id);
  }

  function onDropTo(folderPath: string | null) {
    if (!dragId) return;
    setFolder(dragId, folderPath);
    setDragId(null);
    setDropTarget(null);
  }

  function toggleCollapse(path: string) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderAddForm() {
    return (
      <li className="nk-tree-secret--form">
        <input
          className="nk-input"
          placeholder="URL"
          autoFocus
          value={addUrl}
          onChange={(e) => setAddUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
            if (e.key === "Escape") onCancel();
          }}
        />
        {detectedPlatform && (
          <div className="nk-link-form-platform">
            <span className={`nk-platform-badge nk-platform--${detectedPlatform}`}>
              {platformLabel(detectedPlatform)}
            </span>
            <span className="nk-muted" style={{ fontSize: "11px" }}>detected</span>
          </div>
        )}
        <input
          className="nk-input"
          placeholder="Title (optional)"
          value={addTitle}
          onChange={(e) => setAddTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
            if (e.key === "Escape") onCancel();
          }}
        />
        <input
          className="nk-input"
          placeholder="Tags (comma-separated)"
          value={addTags}
          onChange={(e) => setAddTags(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
            if (e.key === "Escape") onCancel();
          }}
        />
        {addingIn && (
          <div className="nk-muted" style={{ fontSize: "11px" }}>
            Saving to <strong>{addingIn}</strong>
          </div>
        )}
        <div style={{ display: "flex", gap: "var(--gap-2)" }}>
          <button className="nk-btn nk-btn--primary" onClick={onAdd} disabled={!addUrl.trim()}>
            Save
          </button>
          <button className="nk-btn" onClick={onCancel}>Cancel</button>
        </div>
      </li>
    );
  }

  function renderLinkRow(link: SavedLink, depth: number) {
    const menu = `link:${link.id}`;
    const active = activeLinkKey === tabKey({ type: "link", id: link.id });
    const guideLeft = 8 + depth * 16 + 7;
    return (
      <li
        key={link.id}
        draggable
        className={"nk-tree-item nk-tree-item--note nk-tree-secret" + (active ? " active" : "")}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => openLink(link)}
        onDragStart={(e) => {
          setDragId(link.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", link.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setDropTarget(null);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          promptMove(link);
        }}
      >
        <span className="nk-guide" style={{ left: guideLeft }} aria-hidden />
        <Link2 size={14} className="nk-tree-icon" aria-hidden />
        <span className="nk-tree-stack">
          <span className="nk-tree-label">
            {link.encrypted && !encryptionRequired && (
              <Lock size={11} strokeWidth={2} aria-label="Encrypted" className="nk-tree-lock" />
            )}
            {link.title || link.url}
          </span>
          <span className="nk-tree-sub" aria-hidden>{hostname(link.url)}</span>
        </span>
        <span className="nk-tree-ctx-wrap">
          <button
            className="nk-tree-ctx-btn"
            title="More options"
            aria-label="More options"
            onClick={(e) => {
              e.stopPropagation();
              setCtxMenu((cur) => (cur === menu ? null : menu));
            }}
          >
            <MoreHorizontal size={13} aria-hidden />
          </button>
          {ctxMenu === menu && (
            <ul className="nk-ctx-menu" role="menu">
              <li role="none">
                <button
                  role="menuitem"
                  className="nk-ctx-menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    promptMove(link);
                  }}
                >
                  <MoveRight size={13} aria-hidden /> Move to folder…
                </button>
              </li>
              <li role="none">
                <button
                  role="menuitem"
                  className="nk-ctx-menu-item nk-ctx-menu-item--danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteLink(link);
                  }}
                >
                  <Trash2 size={13} aria-hidden /> Delete
                </button>
              </li>
            </ul>
          )}
        </span>
      </li>
    );
  }

  // eslint-disable-next-line max-lines-per-function -- recursive folder-tree renderer with drag-and-drop handlers, add form, and context menus
  function renderNode(node: FolderNode, depth: number): React.ReactElement[] {
    const isRoot = node.path === "";
    const isCollapsed = collapsed.has(node.path);
    const dropClass = dropTarget === node.path ? " drop" : "";
    const rows: React.ReactElement[] = [];
    const menu = `folder:${node.path}`;

    if (!isRoot) {
      rows.push(
        <li key={`folder:${node.path}`} className="nk-tree-group">
          <div
            className={`nk-tree-item nk-tree-item--folder${dropClass}`}
            style={{ paddingLeft: 8 + depth * 16 }}
            onClick={() => openLinkFolder(node.path)}
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
            <span
              className={"nk-disclosure" + (isCollapsed ? "" : " open")}
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapse(node.path);
              }}
              aria-hidden
            >
              <ChevronRight size={12} />
            </span>
            <Folder size={14} className="nk-tree-icon" aria-hidden />
            <span className="nk-tree-label">{node.name}</span>
            <span className="nk-tree-count">{node.links.length}</span>
            <span className="nk-tree-ctx-wrap">
              <button
                className="nk-tree-ctx-btn"
                title="Add link here"
                aria-label="Add link here"
                onClick={(e) => {
                  e.stopPropagation();
                  openAddForm(node.path);
                }}
              >
                <Plus size={13} aria-hidden />
              </button>
              <button
                className="nk-tree-ctx-btn"
                title="More options"
                aria-label="More options"
                onClick={(e) => {
                  e.stopPropagation();
                  setCtxMenu((cur) => (cur === menu ? null : menu));
                }}
              >
                <MoreHorizontal size={13} aria-hidden />
              </button>
              {ctxMenu === menu && (
                <ul className="nk-ctx-menu" role="menu">
                  <li role="none">
                    <button
                      role="menuitem"
                      className="nk-ctx-menu-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddForm(node.path);
                      }}
                    >
                      <Plus size={13} aria-hidden /> New link here
                    </button>
                  </li>
                  <li role="none">
                    <button
                      role="menuitem"
                      className="nk-ctx-menu-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        createNewFolder(node.path);
                        setCtxMenu(null);
                      }}
                    >
                      <FolderPlus size={13} aria-hidden /> New subfolder
                    </button>
                  </li>
                  <li role="none">
                    <button
                      role="menuitem"
                      className="nk-ctx-menu-item nk-ctx-menu-item--danger"
                      onClick={(e) => onDeleteFolder(node.path, e)}
                    >
                      <Trash2 size={13} aria-hidden /> Delete folder
                    </button>
                  </li>
                </ul>
              )}
            </span>
          </div>
        </li>,
      );
    }

    if (isCollapsed && !isRoot) return rows;

    const childDepth = isRoot ? depth : depth + 1;
    for (const c of node.children) rows.push(...renderNode(c, childDepth));
    if (!isRoot && addingIn === node.path) rows.push(renderAddForm());
    for (const l of node.links) rows.push(renderLinkRow(l, childDepth));
    return rows;
  }

  const isEmpty = links.length === 0 && folders.length === 0;

  return (
    <>
      <div className="nk-tree-toolbar">
        <button
          className="nk-tree-tb-btn"
          title="New link"
          aria-label="New link"
          onClick={() => openAddForm(null)}
        >
          <Plus size={14} aria-hidden />
        </button>
        <button
          className="nk-tree-tb-btn"
          title="New folder"
          aria-label="New folder"
          onClick={() => createNewFolder(null)}
        >
          <FolderPlus size={14} aria-hidden />
        </button>
        <button
          className="nk-tree-tb-btn"
          title={allCollapsed ? "Expand all" : "Collapse all"}
          aria-label={allCollapsed ? "Expand all" : "Collapse all"}
          onClick={allCollapsed ? expandAll : collapseAll}
        >
          <ChevronsDownUp size={14} aria-hidden />
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="nk-link-tags-filter">
          <button
            className={`nk-tag-filter-btn${!filterTag ? " active" : ""}`}
            onClick={() => setFilterTag(null)}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              className={`nk-tag-filter-btn${filterTag === tag ? " active" : ""}`}
              onClick={() => setFilterTag(filterTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {isEmpty && !isAdding ? (
        <div className="nk-empty nk-empty--center">
          <Link2
            size={36}
            aria-hidden
            style={{ color: "var(--muted)", opacity: 0.4, marginBottom: 14 }}
          />
          <p>No links yet.</p>
          <p className="nk-empty-hint">Bookmarks with auto-detected platform tags.</p>
          <div className="nk-empty-cta-row">
            <button className="nk-empty-cta" onClick={() => openAddForm(null)}>
              <Plus size={14} aria-hidden /> Add link
            </button>
          </div>
        </div>
      ) : (
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
          {addingIn === null && renderAddForm()}
          {renderNode(tree, 0)}
          {!isEmpty && filtered.length === 0 && folders.length === 0 && !isAdding && (
            <li className="nk-tree-secret-empty">
              {filterTag ? `No links tagged "${filterTag}".` : "No links yet."}
            </li>
          )}
        </ul>
      )}
    </>
  );
}
