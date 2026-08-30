/**
 * Share dialog — mounted once near the app root, driven by `useShareStore`.
 * Built entirely on the agent-native sharing logic in `lib/directory.ts`:
 * lookup+verify (`previewShare`), confirm-with-safety-number (`shareItem`),
 * revoke (`unshareItem`), and passphrase links (`createShareLink`).
 */
import { Copy, Link as LinkIcon, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createShareLink,
  previewShare,
  shareItem,
  unshareItem,
  type SharePreview,
} from "../../../composition/directory";
import { listItemShares, type ShareGrant } from "../../../lib/secrets-vault";
import { useShareStore } from "../stores/shareStore";
import { Modal } from "./Modal";

function ShareList({
  shares,
  busy,
  onRevoke,
}: {
  shares: ShareGrant[];
  busy: boolean;
  onRevoke: (email: string) => void;
}) {
  if (shares.length === 0) return null;
  return (
    <div className="nk-share-list">
      <p className="nk-muted">Shared with</p>
      {shares.map((grant) => (
        <div key={grant.email} className="nk-share-row">
          <span>{grant.email}</span>
          <button
            type="button"
            className="nk-iconbtn"
            title={`Revoke ${grant.email} (forward-only)`}
            aria-label={`Revoke ${grant.email}`}
            disabled={busy}
            onClick={() => onRevoke(grant.email)}
          >
            <Trash2 size={13} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

function ShareLookupForm({
  email,
  busy,
  onChange,
  onLookup,
}: {
  email: string;
  busy: boolean;
  onChange: (value: string) => void;
  onLookup: () => void;
}) {
  return (
    <div className="nk-share-add">
      <input
        type="email"
        placeholder="Share with a NoteKit user by email"
        value={email}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onLookup()}
      />
      <button
        type="button"
        className="nk-btn"
        disabled={busy || !email.trim()}
        onClick={onLookup}
      >
        Look up
      </button>
    </div>
  );
}

function ShareVerifyPanel({
  preview,
  busy,
  onBack,
  onConfirmShare,
}: {
  preview: SharePreview;
  busy: boolean;
  onBack: () => void;
  onConfirmShare: () => void;
}) {
  return (
    <div className="nk-share-verify">
      <p>
        Share with <strong>{preview.email}</strong> ({preview.recipientCount} device
        {preview.recipientCount === 1 ? "" : "s"}).
      </p>
      <p className="nk-muted">
        Confirm their safety number out-of-band — ask them to read theirs and check it matches:
      </p>
      <p className="nk-safety-number">{preview.safetyNumber}</p>
      <div className="nk-dialog__footer nk-dialog__footer--confirm">
        <button type="button" className="nk-btn" disabled={busy} onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="nk-btn nk-btn--primary"
          disabled={busy}
          onClick={onConfirmShare}
        >
          Confirm &amp; share
        </button>
      </div>
    </div>
  );
}

function PassphraseLinkPanel({ link }: { link: { passphrase: string; armored: string } }) {
  return (
    <div className="nk-share-link">
      <p className="nk-muted">
        Send this passphrase and the encrypted file separately. Anyone with both can read a
        snapshot of this item — it won't update on edits.
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
        className="nk-btn nk-share-linkbtn"
        title="Copy the encrypted file to share"
        onClick={() => void navigator.clipboard?.writeText(link.armored)}
      >
        <Copy size={13} aria-hidden /> Copy encrypted file
      </button>
    </div>
  );
}

// eslint-disable-next-line max-lines-per-function -- dialog handles lookup, preview, confirm-share, revoke, and passphrase-link flows
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset: clearing transient state synchronously when the share target changes is the desired UX behavior
    setEmail("");
    setPreview(null);
    setLink(null);
    setError(null);
    void refreshShares();
  }, [refreshShares]);

  // Escape closes — preserved from original. Modal's Escape is gated by
  // isDismissable (false here), so we wire it manually.
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
    const address = email.trim().toLowerCase();
    if (!address) return;
    const lookupPreview = await run(() => previewShare(address));
    if (lookupPreview === undefined) return;
    if (!lookupPreview) {
      setError(`No NoteKit user with verifiable keys found for ${address}.`);
      return;
    }
    if (lookupPreview.recipientCount === 0) {
      setError(
        `${address} has no verified devices to share with${lookupPreview.rejected ? ` (${lookupPreview.rejected} record(s) failed verification)` : ""}.`,
      );
      return;
    }
    setPreview(lookupPreview);
  }

  async function onConfirmShare() {
    if (!preview || !target) return;
    const result = await run(() => shareItem(target.kind, target.id, preview.email));
    if (result?.shared) {
      setPreview(null);
      setEmail("");
      await refreshShares();
    } else if (result) {
      setError(`Couldn't share (${result.reason ?? "unknown"}).`);
    }
  }

  async function onRevoke(grantEmail: string) {
    if (!target) return;
    await run(() => unshareItem(target.kind, target.id, grantEmail));
    await refreshShares();
  }

  async function onCreateLink() {
    if (!target) return;
    const createdLink = await run(() => createShareLink(target.kind, target.id));
    if (createdLink) setLink(createdLink);
    else if (!error) setError("Couldn't create a share link for this item.");
  }

  return (
    <Modal
      open={!!target}
      onClose={close}
      title={`Share "${target.title}"`}
      isDismissable={false}
    >
      <div className="nk-modal-body">
        <ShareList shares={shares} busy={busy} onRevoke={onRevoke} />

        {!preview ? (
          <ShareLookupForm
            email={email}
            busy={busy}
            onChange={setEmail}
            onLookup={onLookup}
          />
        ) : (
          <ShareVerifyPanel
            preview={preview}
            busy={busy}
            onBack={() => setPreview(null)}
            onConfirmShare={onConfirmShare}
          />
        )}

        {link ? (
          <PassphraseLinkPanel link={link} />
        ) : (
          !preview && (
            <button
              type="button"
              className="nk-btn nk-share-linkbtn"
              disabled={busy}
              onClick={onCreateLink}
            >
              <LinkIcon size={13} aria-hidden /> Create a passphrase link (no account needed)
            </button>
          )
        )}

        {error && <p className="nk-error-text">{error}</p>}
      </div>
    </Modal>
  );
}
