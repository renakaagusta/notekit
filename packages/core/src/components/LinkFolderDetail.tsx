import { ChevronRight, Folder, FolderOpen, Link2 } from "lucide-react";
import { useMemo } from "react";
import type { SavedLink } from "../domain/entities/link";
import { useLayoutStore } from "../stores/layoutStore";
import { useLinksStore } from "../stores/linksStore";

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The contents of a links folder rendered as a pane tab: immediate subfolders
 * (which open their own linkfolder tab) followed by the links filed directly in
 * it (which open as link tabs). Mirrors FolderDetail for the Links surface.
 */
export function LinkFolderDetail({ path, paneId }: { path: string; paneId: string }) {
  const all = useLinksStore((s) => s.all());
  const folders = useLinksStore((s) => s.folders);

  const label = path.split("/").filter(Boolean).pop() || "Folder";

  const { subfolders, links } = useMemo(() => {
    const prefix = path ? `${path}/` : "";
    const childSet = new Set<string>();
    for (const f of folders) {
      if (!f.startsWith(prefix) || f === path) continue;
      const rest = f.slice(prefix.length);
      const first = rest.split("/")[0];
      if (first) childSet.add(prefix + first);
    }
    for (const l of all) {
      if (!l.folder || !l.folder.startsWith(prefix) || l.folder === path) continue;
      const rest = l.folder.slice(prefix.length);
      const first = rest.split("/")[0];
      if (first) childSet.add(prefix + first);
    }
    const linksHere = all
      .filter((l) => (l.folder ?? "") === path)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return {
      subfolders: [...childSet].sort((a, b) => a.localeCompare(b)),
      links: linksHere,
    };
  }, [all, folders, path]);

  const total = subfolders.length + links.length;

  function openFolder(p: string) {
    useLayoutStore.getState().openTab({ type: "linkfolder", path: p }, paneId);
  }
  function openLink(l: SavedLink) {
    useLayoutStore.getState().openTab({ type: "link", id: l.id }, paneId);
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
          : `${links.length} link${links.length === 1 ? "" : "s"}` +
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
        {links.map((l) => (
          <li key={l.id}>
            <button className="nk-index-row" onClick={() => openLink(l)}>
              <Link2 size={15} className="nk-index-icon" aria-hidden />
              <span className="nk-index-stack">
                <span className="nk-index-label">{l.title || l.url}</span>
                <span className="nk-index-sub">{hostname(l.url)}</span>
              </span>
              <ChevronRight size={14} className="nk-index-chevron" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
