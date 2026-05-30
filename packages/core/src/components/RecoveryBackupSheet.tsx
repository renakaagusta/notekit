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
import { useEffect, useState } from "react";
import { Eye, EyeOff, Copy, Download, Check, ShieldAlert, X } from "lucide-react";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";
import type { StoredRecovery } from "../lib/crypto/recovery-store";

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
      setRevealed(false);
      setCopied(false);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await load();
        if (!cancelled) setRecovery(r);
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

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const words = recovery ? recovery.mnemonic.split(" ") : [];
  const alreadyBackedUp = !!recovery?.backedUp;

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
    const body =
      `NoteKit recovery phrase\n` +
      `Created: ${recovery.createdAt}\n\n` +
      recovery.mnemonic +
      `\n\nKeep this secret. Anyone with these 24 words can read your encrypted notes.\n` +
      `Store it offline or in a password manager — never anywhere that syncs unencrypted.\n`;
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "notekit-recovery-phrase.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    void completeBackup("download");
  }

  function onReveal() {
    // Revealing alone is NOT a backup — looking at the words doesn't save
    // them. Copy/download count immediately; a revealed phrase only counts
    // once the user explicitly confirms they've written it down.
    setRevealed((v) => !v);
  }

  return (
    <div className="nk-modal-backdrop" role="presentation">
      <div
        className="nk-modal nk-recovery-backup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nk-recovery-backup-title"
      >
        <header className="nk-modal-hd">
          <ShieldAlert size={16} aria-hidden />
          <h2 id="nk-recovery-backup-title">Back up your recovery phrase</h2>
          <button
            type="button"
            className="nk-iconbtn nk-modal-close"
            onClick={close}
            title="Close"
            aria-label="Close"
          >
            <X size={14} aria-hidden />
          </button>
        </header>

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
              <div className="nk-modal-actions">
                <button
                  type="button"
                  className="nk-btn nk-btn--primary"
                  onClick={close}
                >
                  Got it
                </button>
              </div>
            </>
          )}

          {recovery && (
            <>
              <div className="nk-mnemonic-hd">
                <button type="button" className="nk-btn" onClick={onReveal}>
                  {revealed ? (
                    <>
                      <EyeOff size={14} aria-hidden /> Hide
                    </>
                  ) : (
                    <>
                      <Eye size={14} aria-hidden /> Reveal
                    </>
                  )}
                </button>
                {alreadyBackedUp && (
                  <span className="nk-muted nk-backup-state">
                    <Check size={13} aria-hidden /> Backed up
                  </span>
                )}
              </div>

              {revealed ? (
                <ol className="nk-mnemonic-grid">
                  {words.map((w, i) => (
                    <li key={i}>
                      <span className="nk-mnemonic-num">{i + 1}</span>
                      <span className="nk-mnemonic-word">{w}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="nk-mnemonic-hidden" aria-hidden>
                  •••• •••• •••• •••• •••• •••• •••• ••••
                </div>
              )}

              <div className="nk-modal-actions">
                <button type="button" className="nk-btn" onClick={onCopy}>
                  {copied ? (
                    <>
                      <Check size={14} aria-hidden /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} aria-hidden /> Copy
                    </>
                  )}
                </button>
                <button type="button" className="nk-btn" onClick={onDownload}>
                  <Download size={14} aria-hidden /> Download file
                </button>
                {revealed && !alreadyBackedUp ? (
                  <button
                    type="button"
                    className="nk-btn nk-btn--primary"
                    onClick={() => completeBackup("reveal")}
                  >
                    I've written it down
                  </button>
                ) : (
                  <button
                    type="button"
                    className="nk-btn nk-btn--primary"
                    onClick={close}
                  >
                    Done
                  </button>
                )}
              </div>
              <p className="nk-muted nk-backup-hint">
                Paste into a password manager (1Password, Bitwarden) or save the
                file to your private cloud. Never put it anywhere that syncs
                unencrypted, or into chat.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
