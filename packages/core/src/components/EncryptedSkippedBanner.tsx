/**
 * Surface "you have encrypted items this device can't read" as a
 * dismissible banner instead of a console log. Mounted near the top of
 * the main app shell. Shows whenever the last pull saw .age files that
 * this device's crypto identity couldn't decrypt — typically because
 * the device is mid-pair, freshly added, or rotating recovery keys.
 *
 * Stays visible until either (a) the next pull successfully decrypts
 * everything (counts go to zero, banner unmounts) or (b) the user
 * clicks Dismiss for the session.
 */

import { useState } from "react";
import { Lock, X } from "lucide-react";
import { useSyncStore } from "../stores/syncStore";
import { useCryptoStore } from "../stores/cryptoStore";

export function EncryptedSkippedBanner() {
  const skipped = useSyncStore((s) => s.encryptedSkipped);
  const cryptoPhase = useCryptoStore((s) => s.phase);
  const [dismissed, setDismissed] = useState(false);

  const total = skipped.notes + skipped.tickets + skipped.links;
  if (total === 0 || dismissed) return null;

  const parts: string[] = [];
  if (skipped.notes > 0)
    parts.push(`${skipped.notes} note${skipped.notes === 1 ? "" : "s"}`);
  if (skipped.tickets > 0)
    parts.push(`${skipped.tickets} ticket${skipped.tickets === 1 ? "" : "s"}`);
  if (skipped.links > 0)
    parts.push(`${skipped.links} link${skipped.links === 1 ? "" : "s"}`);

  // The body sentence depends on why we're skipping. If the user hasn't
  // paired this device yet, the fix is "complete pairing"; otherwise it's
  // "ask another device to add this device's pubkey to the recipient list".
  const needsPairing =
    cryptoPhase === "needs-setup" ||
    cryptoPhase === "needs-pair" ||
    cryptoPhase === "waiting-approval";

  return (
    <div className="nk-encrypted-banner" role="status">
      <Lock size={14} aria-hidden className="nk-encrypted-banner-icon" />
      <div className="nk-encrypted-banner-body">
        <strong>{parts.join(", ")} encrypted and not visible here.</strong>{" "}
        {needsPairing ? (
          <>Finish pairing this device to unlock them.</>
        ) : (
          <>
            This device's identity isn't in the recipient list yet — pair from
            another device, or wait for the next re-encryption.
          </>
        )}
      </div>
      <button
        type="button"
        className="nk-iconbtn"
        onClick={() => setDismissed(true)}
        title="Dismiss for this session"
        aria-label="Dismiss"
      >
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
