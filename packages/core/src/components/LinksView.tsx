import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ExternalLink,
  Folder,
  Lock,
  MoreHorizontal,
  Unlock,
  X,
} from "lucide-react";
import { useLinksStore } from "../stores/linksStore";
import { useCryptoStore } from "../stores/cryptoStore";
import { useVaultStore } from "../stores/vaultStore";
import { useE2eeOnboardingStore } from "../lib/e2ee-onboarding";
import { detectPlatform, platformLabel } from "../lib/link-platform";
import type { SavedLink } from "../types/link";

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
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    node.children.forEach(sort);
  };
  sort(root);
  return root;
}

export function LinksView() {
  const links = useLinksStore((s) => s.all());
  const folders = useLinksStore((s) => s.folders);
  const upsert = useLinksStore((s) => s.upsert);
  const remove = useLinksStore((s) => s.remove);
  const toggleEncrypted = useLinksStore((s) => s.toggleEncrypted);
  const setFolder = useLinksStore((s) => s.setFolder);
  // Born-E2EE vault: every link is sealed, no per-item toggle.
  const encryptionRequired = useCryptoStore((s) => s.encryptionRequired);
  const createFolder = useLinksStore((s) => s.createFolder);
  const removeFolder = useLinksStore((s) => s.removeFolder);
  const vaultId = useVaultStore((s) => s.activeId);
  const requestEncrypt = useE2eeOnboardingStore((s) => s.requestEncrypt);

  function handleToggleEncrypted(link: {
    id: string;
    title: string;
    encrypted?: boolean;
  }) {
    if (link.encrypted) {
      toggleEncrypted(link.id);
      return;
    }
    if (!vaultId) return;
    requestEncrypt({
      vaultId,
      kind: "link",
      title: link.title,
      onConfirm: () => toggleEncrypted(link.id),
    });
  }

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

  function openAddForm(folder: string | null) {
    setAddingIn(folder);
    setAddUrl("");
    setAddTitle("");
    setAddTags("");
    if (folder) {
      setCollapsed((cur) => {
        if (!cur.has(folder)) return cur;
        const next = new Set(cur);
        next.delete(folder);
        return next;
      });
    }
  }

  function onAdd() {
    const url = addUrl.trim();
    if (!url || !isAdding) return;
    upsert({
      url,
      title: addTitle.trim() || undefined,
      tags: parseTags(addTags),
      folder: addingIn ?? null,
    });
    setAddingIn(undefined);
    setAddUrl("");
    setAddTitle("");
    setAddTags("");
  }

  function onCancel() {
    setAddingIn(undefined);
    setAddUrl("");
    setAddTitle("");
    setAddTags("");
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
      (l) =>
        l.folder === folderPath || (l.folder ?? "").startsWith(`${folderPath}/`),
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
    const next = window.prompt(
      "Move to folder (use / for nesting, empty for root):",
      link.folder ?? "",
    );
    if (next === null) return;
    setFolder(link.id, next.trim() || null);
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
  const tree = useMemo(
    () => buildTree(filtered, folders),
    [filtered, folders],
  );

  const allTags = useMemo(
    () => Array.from(new Set(links.flatMap((l) => l.tags))).sort(),
    [links],
  );

  function renderAddForm() {
    return (
      <div className="nk-link-form">
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
            <span className="nk-muted" style={{ fontSize: "11px" }}>
              detected
            </span>
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
          <button
            className="nk-btn nk-btn--primary"
            onClick={onAdd}
            disabled={!addUrl.trim()}
          >
            Save
          </button>
          <button className="nk-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  function renderLinkCard(link: SavedLink, depth: number) {
    const noteGuideLeft =
      depth > 0 ? 8 + (depth - 1) * 16 + 7 : undefined;
    return (
      <li
        key={link.id}
        draggable
        className="nk-tree-item nk-tree-item--link"
        style={{
          paddingLeft: 8 + depth * 16,
          ...(noteGuideLeft !== undefined
            ? ({ "--nk-guide": `${noteGuideLeft}px` } as React.CSSProperties)
            : {}),
        }}
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
        <div className="nk-link-card-main">
          <div className="nk-link-card-top">
            {link.platform && (
              <span
                className={`nk-platform-badge nk-platform--${link.platform}`}
              >
                {platformLabel(link.platform)}
              </span>
            )}
            {link.encrypted && (
              <Lock
                size={12}
                strokeWidth={2}
                aria-label="Encrypted"
                className="nk-link-lock"
              />
            )}
            <span className="nk-link-title">{link.title}</span>
          </div>
          <div className="nk-link-url">{hostname(link.url)}</div>
          {link.tags.length > 0 && (
            <div className="nk-link-card-tags">
              {link.tags.map((tag) => (
                <button
                  key={tag}
                  className="nk-link-tag"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilterTag(filterTag === tag ? null : tag);
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="nk-link-card-actions">
          <a
            className="nk-iconbtn"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open link"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={13} aria-hidden />
          </a>
          {!encryptionRequired && (
            <button
              className="nk-iconbtn"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleEncrypted(link);
              }}
              title={
                link.encrypted
                  ? "Decrypt this link and store it as plain markdown"
                  : "End-to-end encrypt this link"
              }
              aria-label={link.encrypted ? "Decrypt link" : "Encrypt link"}
              aria-pressed={!!link.encrypted}
            >
              {link.encrypted ? (
                <Unlock size={13} aria-hidden />
              ) : (
                <Lock size={13} aria-hidden />
              )}
            </button>
          )}
          <span className="nk-tree-ctx-wrap">
            <button
              className="nk-iconbtn"
              title="More options"
              aria-label="More options"
              onClick={(e) => {
                e.stopPropagation();
                setCtxMenu((cur) =>
                  cur === `link:${link.id}` ? null : `link:${link.id}`,
                );
              }}
            >
              <MoreHorizontal size={13} aria-hidden />
            </button>
            {ctxMenu === `link:${link.id}` && (
              <TreeContextMenu
                onClose={() => setCtxMenu(null)}
                items={[
                  {
                    label: "Move to folder…",
                    onClick: () => promptMove(link),
                  },
                  {
                    label: "Delete",
                    danger: true,
                    onClick: () => remove(link.id),
                  },
                ]}
              />
            )}
          </span>
        </div>
      </li>
    );
  }

  function renderNode(node: FolderNode, depth: number): React.ReactElement[] {
    const isRoot = node.path === "";
    const isCollapsed = collapsed.has(node.path);
    const dropClass = dropTarget === node.path ? " drop" : "";
    const rows: React.ReactElement[] = [];

    if (!isRoot) {
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
          onClick={() => toggleCollapse(node.path)}
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
                    label: "New link here",
                    onClick: () => openAddForm(node.path),
                  },
                  {
                    label: "New subfolder",
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
        </li>,
      );
    }

    if (isCollapsed && !isRoot) return rows;

    const childDepth = isRoot ? depth : depth + 1;
    for (const c of node.children) rows.push(...renderNode(c, childDepth));
    for (const l of node.links) rows.push(renderLinkCard(l, childDepth));
    return rows;
  }

  const isEmpty = links.length === 0 && folders.length === 0;

  return (
    <div className="nk-links-panel">
      <header className="nk-links-hd">
        <h2>Links</h2>
        <div style={{ display: "flex", gap: "var(--gap-2)" }}>
          <button
            className="nk-btn"
            onClick={() => createNewFolder(null)}
            title="New folder at root"
          >
            New folder
          </button>
          {!isAdding && (
            <button
              className="nk-btn nk-btn--primary"
              onClick={() => openAddForm(null)}
            >
              Add link
            </button>
          )}
        </div>
      </header>

      {isAdding && renderAddForm()}

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

      {isEmpty && !isAdding && (
        <div className="nk-empty" style={{ padding: "var(--gap-5) var(--gap-3)" }}>
          <p>No links yet. Add one above.</p>
        </div>
      )}

      {!isEmpty && filtered.length === 0 && folders.length === 0 && !isAdding && (
        <div className="nk-empty" style={{ padding: "var(--gap-5) var(--gap-3)" }}>
          <p>{filterTag ? `No links tagged "${filterTag}".` : "No links yet."}</p>
        </div>
      )}

      {(folders.length > 0 || filtered.length > 0) && (
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
      )}
    </div>
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
