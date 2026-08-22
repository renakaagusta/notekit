import { ExternalLink, Image as ImageIcon, Link2, Lock, MoveRight, Share2, Trash2, Unlock, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SavedLink } from "../domain/entities/link";
import { platformLabel } from "../domain/link-platform";
import { useE2eeOnboardingStore } from "../lib/e2ee-onboarding";
import { useCryptoStore } from "../stores/cryptoStore";
import { useLinksStore } from "../stores/linksStore";
import { useShareStore } from "../stores/shareStore";
import { useVaultStore } from "../stores/vaultStore";
import { MediaViewer, MediaThumb } from "./MediaViewer";

function isMedia(link: SavedLink): boolean {
  return link.kind === "image" || link.kind === "pdf";
}

/**
 * The full detail for a single saved link, rendered inside a pane tab. Handles
 * open-in-browser, media preview + annotation, per-link E2EE toggle, share,
 * move, and delete — the parts that used to live in the standalone Links panel
 * now live next to the note editor.
 */
// eslint-disable-next-line complexity, max-lines-per-function -- single-link detail: media viewer, encrypt toggle, share, move, and delete states
export function LinkDetail({
  linkId,
  onClose,
}: {
  linkId: string;
  onClose: () => void;
}) {
  const link = useLinksStore((s) => s.links[linkId]);
  const remove = useLinksStore((s) => s.remove);
  const setFolder = useLinksStore((s) => s.setFolder);
  const setAnnotation = useLinksStore((s) => s.setAnnotation);
  const toggleEncrypted = useLinksStore((s) => s.toggleEncrypted);
  const encryptionRequired = useCryptoStore((s) => s.encryptionRequired);
  const openShare = useShareStore((s) => s.open);
  const vaultId = useVaultStore((s) => s.activeId);
  const requestEncrypt = useE2eeOnboardingStore((s) => s.requestEncrypt);

  const [viewing, setViewing] = useState(false);

  // Close the media modal if the tab switches to a different link.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the media overlay when the tab points at a different link
    setViewing(false);
  }, [linkId]);

  if (!link) {
    return (
      <div className="nk-empty nk-empty--center">
        <p>Link not found.</p>
        <div className="nk-empty-cta-row">
          <button className="nk-empty-cta" onClick={onClose}>
            <X size={14} aria-hidden /> Close tab
          </button>
        </div>
      </div>
    );
  }

  // Narrow into a const so the closures below don't fight the possibly-undefined store read.
  const item = link;

  function handleToggleEncrypted() {
    if (item.encrypted) {
      toggleEncrypted(item.id);
      return;
    }
    if (!vaultId) return;
    requestEncrypt({
      vaultId,
      kind: "link",
      title: item.title,
      onConfirm: () => toggleEncrypted(item.id),
    });
  }

  function onMove() {
    const next = window.prompt(
      "Move to folder (use / for nesting, empty for root):",
      item.folder ?? "",
    );
    if (next === null) return;
    setFolder(item.id, next.trim() || null);
  }

  function onDelete() {
    if (!confirm(`Delete "${item.title || item.url}"?`)) return;
    remove(item.id);
    onClose();
  }

  const showMedia = isMedia(item) && !!item.url;

  return (
    <div className="nk-tab-detail nk-tab-detail--fill">
      <div className="nk-tab-detail-header">
        <span className="nk-tab-detail-type">
          <Link2 size={13} aria-hidden /> Link
        </span>
        {item.platform && (
          <span className={`nk-platform-badge nk-platform--${item.platform}`}>
            {platformLabel(item.platform)}
          </span>
        )}
        {item.encrypted && !encryptionRequired && (
          <Lock size={13} strokeWidth={2} aria-label="Encrypted" className="nk-link-lock" />
        )}
      </div>

      <h1 className="nk-tab-detail-title">{item.title || item.url}</h1>
      {item.description && <p className="nk-tab-detail-desc">{item.description}</p>}
      <a
        className="nk-tab-detail-url"
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {item.url}
      </a>

      {item.tags.length > 0 && (
        <div className="nk-tab-detail-tags">
          {item.tags.map((t) => (
            <span key={t} className="nk-tag">{t}</span>
          ))}
        </div>
      )}

      {showMedia && item.kind === "image" && (
        <div className="nk-link-detail-media">
          <MediaThumb url={item.url} onClick={() => setViewing(true)} />
        </div>
      )}

      <div className="nk-tab-detail-actions" style={{ flexWrap: "wrap" }}>
        <a
          className="nk-btn nk-btn--primary"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={14} aria-hidden /> Open in browser
        </a>
        {showMedia && (
          <button className="nk-btn" onClick={() => setViewing(true)}>
            <ImageIcon size={14} aria-hidden /> {item.kind === "pdf" ? "View PDF" : "View / annotate"}
          </button>
        )}
        {!encryptionRequired && (
          <button
            className="nk-btn"
            onClick={handleToggleEncrypted}
            title={
              item.encrypted
                ? "Decrypt this link and store it as plain markdown"
                : "End-to-end encrypt this link"
            }
            aria-pressed={!!item.encrypted}
          >
            {item.encrypted ? (
              <><Unlock size={14} aria-hidden /> Decrypt</>
            ) : (
              <><Lock size={14} aria-hidden /> Encrypt</>
            )}
          </button>
        )}
        {(encryptionRequired || item.encrypted) && (
          <button
            className="nk-btn"
            onClick={() => openShare({ kind: "link", id: item.id, title: item.title || item.url })}
          >
            <Share2 size={14} aria-hidden /> Share
          </button>
        )}
        <button className="nk-btn" onClick={onMove}>
          <MoveRight size={14} aria-hidden /> Move
        </button>
        <button className="nk-btn nk-btn--danger" onClick={onDelete}>
          <Trash2 size={14} aria-hidden /> Delete
        </button>
        <button className="nk-btn" onClick={onClose}>
          <X size={14} aria-hidden /> Close
        </button>
      </div>

      {viewing && showMedia && (
        <MediaViewer
          url={item.url}
          kind={item.kind ?? "link"}
          title={item.title || item.url}
          annotation={item.annotation ?? null}
          onAnnotationChange={(doc) => setAnnotation(item.id, doc)}
          onClose={() => setViewing(false)}
        />
      )}
    </div>
  );
}
