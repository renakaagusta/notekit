import { useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { useLinksStore } from "../stores/linksStore";
import { detectPlatform, platformLabel } from "../lib/link-platform";

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

export function LinksView() {
  const links = useLinksStore((s) => s.all());
  const upsert = useLinksStore((s) => s.upsert);
  const remove = useLinksStore((s) => s.remove);

  const [adding, setAdding] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addTags, setAddTags] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const detectedPlatform = addUrl ? detectPlatform(addUrl) : null;

  function onAdd() {
    const url = addUrl.trim();
    if (!url) return;
    upsert({
      url,
      title: addTitle.trim() || undefined,
      tags: parseTags(addTags),
    });
    setAdding(false);
    setAddUrl("");
    setAddTitle("");
    setAddTags("");
  }

  function onCancel() {
    setAdding(false);
    setAddUrl("");
    setAddTitle("");
    setAddTags("");
  }

  const allTags = Array.from(
    new Set(links.flatMap((l) => l.tags)),
  ).sort();

  const filtered = filterTag
    ? links.filter((l) => l.tags.includes(filterTag))
    : links;

  return (
    <div className="nk-links-panel">
      <header className="nk-links-hd">
        <h2>Links</h2>
        {!adding && (
          <button
            className="nk-btn nk-btn--primary"
            onClick={() => setAdding(true)}
          >
            Add
          </button>
        )}
      </header>

      {adding && (
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
      )}

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

      {filtered.length === 0 && !adding && (
        <div className="nk-empty" style={{ padding: "var(--gap-5) var(--gap-3)" }}>
          <p>{filterTag ? `No links tagged "${filterTag}".` : "No links yet. Add one above."}</p>
        </div>
      )}

      {filtered.length > 0 && (
        <ul className="nk-link-list">
          {filtered.map((link) => (
            <li key={link.id} className="nk-link-card">
              <div className="nk-link-card-main">
                <div className="nk-link-card-top">
                  {link.platform && (
                    <span className={`nk-platform-badge nk-platform--${link.platform}`}>
                      {platformLabel(link.platform)}
                    </span>
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
                        onClick={() => setFilterTag(filterTag === tag ? null : tag)}
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
                >
                  <ExternalLink size={13} aria-hidden />
                </a>
                <button
                  className="nk-iconbtn"
                  onClick={() => remove(link.id)}
                  title="Remove link"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
