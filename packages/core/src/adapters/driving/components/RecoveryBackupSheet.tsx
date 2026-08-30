/**
 * Recovery backup sheet. The recovery phrase is generated silently at setup
 * and lives only on this device until the user takes a copy off it. This sheet
 * is where they do that — and the same artifact (the 24 words) is what unlocks
 * the vault on a device in a different ecosystem, so backup doubles as
 * device-to-device transfer.
 *
 * The phrase stays hidden behind an explicit "Reveal" so it isn't shoulder-
 * surfed by default. Any of copy / download / reveal-and-confirm marks the
 * vault backed up and silences the nudge.
 */
import {
  Eye,
  EyeOff,
  Copy,
  Download,
  Share2,
  Check,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { StoredRecovery } from "../../../lib/crypto/recovery-store";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";
import { Modal } from "./Modal";

const RECOVERY_FILE_NAME = "notekit-recovery-phrase.txt";

/** The exact bytes we hand off on download or share. */
function recoveryFileBody(recovery: StoredRecovery): string {
  return (
    `NoteKit recovery phrase\n` +
    `Created: ${recovery.createdAt}\n\n` +
    recovery.mnemonic +
    `\n\nKeep this secret. Anyone with these 24 words can read your encrypted notes.\n` +
    `Store it offline or in a password manager — never anywhere that syncs unencrypted.\n`
  );
}

/** True when the platform can present a native share sheet for a text file. */
function canShareRecovery(): boolean {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  // Some browsers expose `share` but not file sharing; we fall back to text
  // there, so the button is still useful as long as `share` exists.
  return true;
}

function MnemonicGrid({ words }: { words: string[] }) {
  return (
    <ol className="nk-mnemonic-grid">
      {words.map((word, index) => (
        <li key={index}>
          <span className="nk-mnemonic-num">{index + 1}</span>
          <span className="nk-mnemonic-word">{word}</span>
        </li>
      ))}
    </ol>
  );
}

function BackupActionButtons({
  copied,
  revealed,
  alreadyBackedUp,
  onCopy,
  onShare,
  onDownload,
  onConfirmWritten,
  onClose,
}: {
  copied: boolean;
  revealed: boolean;
  alreadyBackedUp: boolean;
  onCopy: () => void;
  onShare: () => void;
  onDownload: () => void;
  onConfirmWritten: () => void;
  onClose: () => void;
}) {
  return (
    <div className="nk-modal-actions">
      <button type="button" className="nk-btn" onClick={onCopy}>
        {copied ? <><Check size={14} aria-hidden /> Copied</> : <><Copy size={14} aria-hidden /> Copy</>}
      </button>
      {canShareRecovery() && (
        <button type="button" className="nk-btn" onClick={onShare}>
          <Share2 size={14} aria-hidden /> Share
        </button>
      )}
      <button type="button" className="nk-btn" onClick={onDownload}>
        <Download size={14} aria-hidden /> Download file
      </button>
      {revealed && !alreadyBackedUp ? (
        <button type="button" className="nk-btn nk-btn--primary" onClick={onConfirmWritten}>
          I've written it down
        </button>
      ) : (
        <button type="button" className="nk-btn nk-btn--primary" onClick={onClose}>
          Done
        </button>
      )}
    </div>
  );
}

function RecoveryActions({
  recovery,
  revealed,
  copied,
  alreadyBackedUp,
  onReveal,
  onCopy,
  onShare,
  onDownload,
  onConfirmWritten,
  onClose,
}: {
  recovery: StoredRecovery;
  revealed: boolean;
  copied: boolean;
  alreadyBackedUp: boolean;
  onReveal: () => void;
  onCopy: () => void;
  onShare: () => void;
  onDownload: () => void;
  onConfirmWritten: () => void;
  onClose: () => void;
}) {
  const words = recovery.mnemonic.split(" ");
  return (
    <>
      <div className="nk-mnemonic-hd">
        <button type="button" className="nk-btn" onClick={onReveal}>
          {revealed ? <><EyeOff size={14} aria-hidden /> Hide</> : <><Eye size={14} aria-hidden /> Reveal</>}
        </button>
        {alreadyBackedUp && (
          <span className="nk-muted nk-backup-state">
            <Check size={13} aria-hidden /> Backed up
          </span>
        )}
      </div>
      {revealed ? (
        <MnemonicGrid words={words} />
      ) : (
        <div className="nk-mnemonic-hidden" aria-hidden>
          •••• •••• •••• •••• •••• •••• •••• ••••
        </div>
      )}
      <BackupActionButtons
        copied={copied}
        revealed={revealed}
        alreadyBackedUp={alreadyBackedUp}
        onCopy={onCopy}
        onShare={onShare}
        onDownload={onDownload}
        onConfirmWritten={onConfirmWritten}
        onClose={onClose}
      />
      <p className="nk-muted nk-backup-hint">
        Paste into a password manager (1Password, Bitwarden) or save the
        file to your private cloud. Never put it anywhere that syncs
        unencrypted, or into chat.
      </p>
    </>
  );
}

// eslint-disable-next-line max-lines-per-function -- recovery sheet manages phrase loading, reveal/hide, copy/download/share actions, and backup confirmation
export function RecoveryBackupSheet() {
  const open = useRecoveryBackupStore((s) => s.sheetOpen);
  const close = useRecoveryBackupStore((s) => s.closeSheet);
  const completeBackup = useRecoveryBackupStore((s) => s.completeBackup);
  const load = useRecoveryBackupStore((s) => s.load);

  const [recovery, setRecovery] = useState<StoredRecovery | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingErr, setLoadingErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting UI state when sheet closes is intentional; no external subscription involved
      setRevealed(false);
      setCopied(false);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const loadedRecovery = await load();
        if (!cancelled) setRecovery(loadedRecovery);
      } catch (e) {
        if (!cancelled) setLoadingErr((e as Error).message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, load]);

  async function onCopy() {
    if (!recovery) return;
    try {
      await navigator.clipboard.writeText(recovery.mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      await completeBackup("copy");
    } catch {
      // clipboard blocked — leave it to reveal/download
    }
  }

  function onDownload() {
    if (!recovery) return;
    const blob = new Blob([recoveryFileBody(recovery)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = RECOVERY_FILE_NAME;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    void completeBackup("download");
  }

  // Hand the phrase to the OS share sheet so the user can route it wherever
  // they keep secrets — iCloud Drive / Files, a password manager, email. We
  // never pick the destination or upload it ourselves: the master key only
  // leaves the device by the user's explicit choice. Prefer a file attachment
  // (lands cleanly in Drive/Files/mail); fall back to text where file share
  // isn't supported, and to a plain download where there's no share sheet.
  async function onShare() {
    if (!recovery) return;
    const body = recoveryFileBody(recovery);
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };
    try {
      const file = new File([body], RECOVERY_FILE_NAME, { type: "text/plain" });
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: "NoteKit recovery phrase" });
      } else {
        await nav.share({ title: "NoteKit recovery phrase", text: body });
      }
      await completeBackup("share");
    } catch (err) {
      // The user dismissing the share sheet throws AbortError — that's not a
      // backup, so leave the nudge armed and stay silent.
      if ((err as Error)?.name === "AbortError") return;
      // Anything else (share unsupported mid-flight, file rejected): degrade
      // to a download so the user still gets their phrase out.
      onDownload();
    }
  }

  function onReveal() {
    // Revealing alone is NOT a backup — looking at the words doesn't save
    // them. Copy/download count immediately; a revealed phrase only counts
    // once the user explicitly confirms they've written it down.
    setRevealed((previous) => !previous);
  }

  const alreadyBackedUp = !!recovery?.backedUp;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Back up your recovery phrase"
    >
      <div className="nk-modal-body">
        <p>
          These 24 words are the master key to your encrypted notes. We keep a
          copy on this device, but if you lose it and haven't backed up, your
          encrypted items are <strong>gone — there's no operator override</strong>.
          This is also how you unlock the vault on a device that can't sync
          keys automatically.
        </p>

        {loadingErr && <p className="nk-error-text">{loadingErr}</p>}

        {loaded && !recovery && !loadingErr && (
          <>
            <p className="nk-muted">
              This device doesn't hold a copy of your recovery phrase — it was
              set up on another device or before phrases were stored locally.
              Use the phrase you saved during setup, or reveal it from a device
              that has it.
            </p>
            <div className="nk-dialog__footer nk-dialog__footer--confirm">
              <button type="button" className="nk-btn nk-btn--primary" onClick={close}>
                Got it
              </button>
            </div>
          </>
        )}

        {recovery && (
          <RecoveryActions
            recovery={recovery}
            revealed={revealed}
            copied={copied}
            alreadyBackedUp={alreadyBackedUp}
            onReveal={onReveal}
            onCopy={onCopy}
            onShare={onShare}
            onDownload={onDownload}
            onConfirmWritten={() => completeBackup("reveal")}
            onClose={close}
          />
        )}
      </div>
    </Modal>
  );
}
