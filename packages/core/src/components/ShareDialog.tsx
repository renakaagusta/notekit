/**
 * Share dialog — mounted once near the app root, driven by `useShareStore`.
 * Built entirely on the agent-native sharing logic in `lib/directory.ts`:
 * lookup+verify (`previewShare`), confirm-with-safety-number (`shareItem`),
 * revoke (`unshareItem`), and passphrase links (`createShareLink`).
 */
import { useCallback, useEffect, useState } from "react";
import { Copy, Link as LinkIcon, Lock, Trash2, X } from "lucide-react";
import { useShareStore } from "../stores/shareStore";
import {
  createShareLink,
  previewShare,
  shareItem,
  unshareItem,
  type SharePreview,
} from "../lib/directory";
import { listItemShares, type ShareGrant } from "../lib/secrets-vault";

export function ShareDialog() {
  const target = useShareStore((s) => s.target);
  const close = useShareStore((s) => s.close);

  const [shares, setShares] = useState<ShareGrant[]>([]);
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<SharePreview | null>(null);
  const [link, setLink] = useState<{ passphrase: string; armored: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshShares = useCallback(async () => {
    if (!target) return;
    setShares(await listItemShares(target.kind, target.id));
  }, [target]);

  useEffect(() => {
    // Reset transient state and load the current grants whenever the target changes.
    setEmail("");
    setPreview(null);
    setLink(null);
    setError(null);
    void refreshShares();
  }, [refreshShares]);

  useEffect(() => {
    if (!target) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, close]);

  if (!target) return null;

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function onLookup() {
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    const p = await run(() => previewShare(addr));
    if (p === undefined) return;
    if (!p) {
      setError(`No NoteKit user with verifiable keys found for ${addr}.`);
      return;
    }
    if (p.recipientCount === 0) {
      setError(
        `${addr} has no verified devices to share with${p.rejected ? ` (${p.rejected} record(s) failed verification)` : ""}.`,
      );
      return;
    }
    setPreview(p);
  }

  async function onConfirmShare() {
    if (!preview || !target) return;
    const res = await run(() => shareItem(target.kind, target.id, preview.email));
    if (res?.shared) {
      setPreview(null);
      setEmail("");
      await refreshShares();
    } else if (res) {
      setError(`Couldn't share (${res.reason ?? "unknown"}).`);
    }
  }

  async function onRevoke(grantEmail: string) {
    if (!target) return;
    await run(() => unshareItem(target.kind, target.id, grantEmail));
    await refreshShares();
  }

  async function onCreateLink() {
    if (!target) return;
    const l = await run(() => createShareLink(target.kind, target.id));
    if (l) setLink(l);
    else if (!error) setError("Couldn't create a share link for this item.");
  }

  return (
    <div className="nk-modal-backdrop" role="presentation">
      <div className="nk-modal nk-share-dialog" role="dialog" aria-modal="true" aria-labelledby="nk-share-title">
        <header className="nk-modal-hd">
          <Lock size={16} aria-hidden />
          <h2 id="nk-share-title">Share “{target.title}”</h2>
          <button type="button" className="nk-iconbtn nk-modal-close" onClick={close} aria-label="Close">
            <X size={14} aria-hidden />
          </button>
        </header>

        <div className="nk-modal-body">
          {/* Current shares */}
          {shares.length > 0 && (
            <div className="nk-share-list">
              <p className="nk-muted">Shared with</p>
              {shares.map((g) => (
                <div key={g.email} className="nk-share-row">
                  <span>{g.email}</span>
                  <button
                    type="button"
                    className="nk-iconbtn"
                    title={`Revoke ${g.email} (forward-only)`}
                    aria-label={`Revoke ${g.email}`}
                    disabled={busy}
                    onClick={() => onRevoke(g.email)}
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add a NoteKit user */}
          {!preview ? (
            <div className="nk-share-add">
              <input
                type="email"
                placeholder="Share with a NoteKit user by email"
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onLookup()}
              />
              <button type="button" className="nk-btn" disabled={busy || !email.trim()} onClick={onLookup}>
                Look up
              </button>
            </div>
          ) : (
            <div className="nk-share-verify">
              <p>
                Share with <strong>{preview.email}</strong> ({preview.recipientCount} device
                {preview.recipientCount === 1 ? "" : "s"}).
              </p>
              <p className="nk-muted">
                Confirm their safety number out-of-band — ask them to read theirs and check it matches:
              </p>
              <p className="nk-safety-number">{preview.safetyNumber}</p>
              <div className="nk-modal-actions">
                <button type="button" className="nk-btn" disabled={busy} onClick={() => setPreview(null)}>
                  Back
                </button>
                <button type="button" className="nk-btn nk-btn--primary" disabled={busy} onClick={onConfirmShare}>
                  Confirm &amp; share
                </button>
              </div>
            </div>
          )}

          {/* Passphrase link for non-users */}
          {link ? (
            <div className="nk-share-link">
              <p className="nk-muted">
                Send this passphrase and the encrypted file separately. Anyone with both can read a
                snapshot of this {target.kind} — it won't update on edits.
              </p>
              <div className="nk-share-row">
                <code>{link.passphrase}</code>
                <button
                  type="button"
                  className="nk-iconbtn"
                  title="Copy passphrase"
                  aria-label="Copy passphrase"
                  onClick={() => void navigator.clipboard?.writeText(link.passphrase)}
                >
                  <Copy size={13} aria-hidden />
                </button>
              </div>
              <button
                type="button"
                className="nk-iconbtn"
                title="Copy encrypted file"
                aria-label="Copy encrypted file"
                onClick={() => void navigator.clipboard?.writeText(link.armored)}
              >
                <Copy size={13} aria-hidden /> Copy encrypted file
              </button>
            </div>
          ) : (
            !preview && (
              <button type="button" className="nk-btn nk-share-linkbtn" disabled={busy} onClick={onCreateLink}>
                <LinkIcon size={13} aria-hidden /> Create a passphrase link (no account needed)
              </button>
            )
          )}

          {error && <p className="nk-error-text">{error}</p>}
        </div>
      </div>
    </div>
  );
}
