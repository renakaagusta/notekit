import { useEffect, useState } from "react";
import { ExternalLink, Pencil, Trash2, X } from "lucide-react";
import { useMediaSrc } from "../lib/useMediaSrc";
import { InkCanvas } from "./InkCanvas";
import { emptyInkDocument, type InkDocument } from "../types/ink";
import type { LinkKind } from "../types/link";

/** Cache-resolved image thumbnail for media cards (#27/#28). */
export function MediaThumb({
  url,
  onClick,
}: {
  url: string;
  onClick?: () => void;
}) {
  const src = useMediaSrc(url) ?? url;
  return (
    <img
      className="nk-link-thumb"
      src={src}
      alt=""
      loading="lazy"
      onClick={onClick}
    />
  );
}

interface MediaViewerProps {
  url: string;
  kind: LinkKind;
  title: string;
  onClose: () => void;
  /** Existing ink annotation over this media (#32). */
  annotation?: InkDocument | null;
  /** Persist annotation changes. When omitted, annotation is read-only. */
  onAnnotationChange?: (doc: InkDocument | null) => void;
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
export function MediaViewer({
  url,
  kind,
  title,
  onClose,
  annotation,
  onAnnotationChange,
}: MediaViewerProps) {
  // Cache-resolved src: cached object URL once available, raw URL until then.
  const src = useMediaSrc(url) ?? url;
  const [annotating, setAnnotating] = useState(false);
  // Annotation is only wired for images today; pdf needs pdf.js page coords (#33).
  const canAnnotate = kind === "image" && !!onAnnotationChange;
  const annotationDoc = annotation ?? emptyInkDocument();
  const hasMarks = !!annotation && annotation.strokes.length > 0;

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
          {canAnnotate && (
            <button
              className="nk-iconbtn"
              onClick={() => setAnnotating((v) => !v)}
              title={annotating ? "Done annotating" : "Annotate"}
              aria-label="Annotate"
              aria-pressed={annotating}
            >
              <Pencil size={14} aria-hidden />
            </button>
          )}
          {canAnnotate && hasMarks && (
            <button
              className="nk-iconbtn"
              onClick={() => onAnnotationChange?.(null)}
              title="Clear annotation"
              aria-label="Clear annotation"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          )}
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
            <div className="nk-annot-stage">
              <img className="nk-media-image" src={src} alt={title} />
              {(annotating || hasMarks) && (
                <div
                  className="nk-annot-overlay"
                  style={{ pointerEvents: annotating ? "auto" : "none" }}
                >
                  <InkCanvas
                    transparent
                    doc={annotationDoc}
                    onChange={(d) => onAnnotationChange?.(d)}
                  />
                </div>
              )}
            </div>
          ) : (
            // First-cut PDF render via the platform viewer; #28 swaps this
            // for pdf.js fed from the byte cache for consistent rendering
            // across web / iOS / Android / Electron.
            <object
              className="nk-media-pdf"
              data={src}
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
