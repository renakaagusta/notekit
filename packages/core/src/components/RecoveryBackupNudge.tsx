/**
 * The "back up your key" nudge. Setup is silent, so this is the one place we
 * make the loud-but-true point: this device holds the only copy of the key,
 * and losing it loses the encrypted notes. It appears once the user actually
 * has an un-backed-up recovery copy, and stays (dismissible per session) until
 * they take a backup. Tapping it opens the backup sheet.
 *
 * Rendered as a slim banner near the app root. It deliberately does NOT block
 * the UI — the whole point of the redesign is no walls — but it doesn't go
 * away permanently on dismiss either; it returns next session until handled.
 */
import { useEffect } from "react";
import { ShieldAlert, X } from "lucide-react";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";

export function RecoveryBackupNudge() {
  const needsBackup = useRecoveryBackupStore((s) => s.needsBackup);
  const armed = useRecoveryBackupStore((s) => s.armed);
  const dismissed = useRecoveryBackupStore((s) => s.dismissed);
  const refresh = useRecoveryBackupStore((s) => s.refresh);
  const openSheet = useRecoveryBackupStore((s) => s.openSheet);
  const dismiss = useRecoveryBackupStore((s) => s.dismissBanner);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Silent until the user has both an un-backed-up key AND has encrypted
  // something worth protecting.
  if (!needsBackup || !armed || dismissed) return null;

  return (
    <div className="nk-backup-nudge" role="status">
      <ShieldAlert size={15} aria-hidden className="nk-backup-nudge-ic" />
      <span className="nk-backup-nudge-text">
        This device holds the only copy of your encryption key. Back it up so you
        don't lose access.
      </span>
      <button
        type="button"
        className="nk-btn nk-btn--primary nk-btn--sm"
        onClick={openSheet}
      >
        Back up now
      </button>
      <button
        type="button"
        className="nk-iconbtn"
        onClick={dismiss}
        title="Remind me later"
        aria-label="Dismiss for now"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
