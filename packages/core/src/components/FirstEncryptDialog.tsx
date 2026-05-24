/**
 * The first-encrypt warning modal. Mounted once near the app root and
 * driven by `useE2eeOnboardingStore` — any place in the UI can call
 * `requestEncrypt(...)` and the dialog appears here.
 *
 * Three explicit facts the user has to acknowledge once per vault. The
 * "I understand" checkbox isn't decorative — keeping the confirm button
 * disabled until it's ticked forces a beat of reading before clicking.
 */

import { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";
import { useE2eeOnboardingStore } from "../lib/e2ee-onboarding";

const KIND_LABEL: Record<"note" | "ticket" | "link", string> = {
  note: "note",
  ticket: "ticket",
  link: "saved link",
};

export function FirstEncryptDialog() {
  const pending = useE2eeOnboardingStore((s) => s.pending);
  const confirm = useE2eeOnboardingStore((s) => s.confirm);
  const cancel = useE2eeOnboardingStore((s) => s.cancel);
  const [acknowledged, setAcknowledged] = useState(false);

  // Reset the checkbox each time the dialog reopens. Otherwise an old
  // accept-state would carry across vaults.
  useEffect(() => {
    if (pending) setAcknowledged(false);
  }, [pending]);

  // Escape closes the modal. No "click outside" close — the warning
  // matters too much to make it accidentally dismissable.
  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, cancel]);

  if (!pending) return null;
  const kind = KIND_LABEL[pending.kind];

  return (
    <div className="nk-modal-backdrop" role="presentation">
      <div
        className="nk-modal nk-first-encrypt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nk-first-encrypt-title"
      >
        <header className="nk-modal-hd">
          <Lock size={16} aria-hidden />
          <h2 id="nk-first-encrypt-title">Encrypt this {kind}?</h2>
          <button
            type="button"
            className="nk-iconbtn nk-modal-close"
            onClick={cancel}
            title="Cancel"
            aria-label="Cancel"
          >
            <X size={14} aria-hidden />
          </button>
        </header>

        <div className="nk-modal-body">
          <p>
            You're about to end-to-end encrypt <strong>{pending.title}</strong>.
            Before you do, three things to know — this only shows once per
            vault:
          </p>
          <ul className="nk-first-encrypt-list">
            <li>
              <strong>Git history persists.</strong> Previous plaintext versions
              of this {kind} stay in the vault's commit history forever. New
              edits going forward are encrypted; the past is not.
            </li>
            <li>
              <strong>Only paired devices can read it.</strong> The {kind} is
              sealed for every device you've registered, plus your recovery
              phrase. A device you add later has to be paired before it can see
              encrypted items.
            </li>
            <li>
              <strong>The recovery phrase is the only fallback.</strong> If you
              lose access to every paired device and your recovery phrase,
              encrypted items are unrecoverable. There's no operator override.
            </li>
          </ul>

          <label className="nk-first-encrypt-ack">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>I understand. Encrypt going forward.</span>
          </label>
        </div>

        <footer className="nk-modal-actions">
          <button type="button" className="nk-btn" onClick={cancel}>
            Cancel
          </button>
          <button
            type="button"
            className="nk-btn nk-btn--primary"
            disabled={!acknowledged}
            onClick={confirm}
          >
            Encrypt {kind}
          </button>
        </footer>
      </div>
    </div>
  );
}
