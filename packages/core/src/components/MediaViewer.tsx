import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import type { LinkKind } from "../types/link";

interface MediaViewerProps {
  url: string;
  kind: LinkKind;
  title: string;
  onClose: () => void;
}

/**
 * Fullscreen viewer for `image` / `pdf` saved-URL items (#27).
 *
 * Renders straight from the remote URL today. The cross-platform pdf.js
 * renderer and the local byte cache land in #28 — they share the same
 * `MediaCache.resolve(url)` resolution point, so this component will swap
 * its `src` for a cached/local source without changing its shape.
 *
 * Privacy note (#25): the bytes live on a third-party host, so opening
 * this leaks the viewer's IP/referrer to that host. The cache work in #28
 * adds the fetch-and-strip-referrer path on native runtimes.
 */
export function MediaViewer({ url, kind, title, onClose }: MediaViewerProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="nk-modal-backdrop nk-media-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="nk-media-shell" onClick={(e) => e.stopPropagation()}>
        <div className="nk-media-bar">
          <span className="nk-media-title">{title}</span>
          <a
            className="nk-iconbtn"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open original"
            aria-label="Open original"
          >
            <ExternalLink size={14} aria-hidden />
          </a>
          <button
            className="nk-iconbtn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="nk-media-body">
          {kind === "image" ? (
            <img className="nk-media-image" src={url} alt={title} />
          ) : (
            // First-cut PDF render via the platform viewer; #28 swaps this
            // for pdf.js fed from the byte cache for consistent rendering
            // across web / iOS / Android / Electron.
            <object
              className="nk-media-pdf"
              data={url}
              type="application/pdf"
              aria-label={title}
            >
              <p className="nk-media-fallback">
                Can&apos;t display this PDF inline.{" "}
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Open it in a new tab
                </a>
                .
              </p>
            </object>
          )}
        </div>
      </div>
    </div>
  );
}
