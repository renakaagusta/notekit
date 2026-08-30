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
import { useE2eeOnboardingStore } from "../../../lib/e2ee-onboarding";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";
import { Modal } from "./Modal";

const KIND_LABEL: Record<"note" | "ticket" | "link", string> = {
  note: "note",
  ticket: "ticket",
  link: "saved link",
};

function EncryptWarningList({ kind }: { kind: string }) {
  return (
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
  );
}

function EncryptDialogBody({
  pending,
  acknowledged,
  onAcknowledgeChange,
}: {
  pending: { title: string; kind: "note" | "ticket" | "link" };
  acknowledged: boolean;
  onAcknowledgeChange: (checked: boolean) => void;
}) {
  const kind = KIND_LABEL[pending.kind];
  return (
    <div className="nk-modal-body">
      <p>
        You're about to end-to-end encrypt <strong>{pending.title}</strong>.
        Before you do, three things to know — this only shows once per vault:
      </p>
      <EncryptWarningList kind={kind} />
      <label className="nk-first-encrypt-ack">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledgeChange(e.target.checked)}
        />
        <span>I understand. Encrypt going forward.</span>
      </label>
    </div>
  );
}

function EncryptDialogFooter({
  kind,
  acknowledged,
  onCancel,
  onConfirm,
}: {
  kind: string;
  acknowledged: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <footer className="nk-dialog__footer nk-dialog__footer--confirm">
      <button type="button" className="nk-btn" onClick={onCancel}>
        Cancel
      </button>
      <button
        type="button"
        className="nk-btn nk-btn--primary"
        disabled={!acknowledged}
        onClick={onConfirm}
      >
        Encrypt {kind}
      </button>
    </footer>
  );
}

export function FirstEncryptDialog() {
  const pending = useE2eeOnboardingStore((s) => s.pending);
  const confirm = useE2eeOnboardingStore((s) => s.confirm);
  const cancel = useE2eeOnboardingStore((s) => s.cancel);
  const armBackupNudge = useRecoveryBackupStore((s) => s.arm);
  const [acknowledged, setAcknowledged] = useState(false);

  // The user is about to create their first encrypted item — from here the
  // recovery key actually protects something, so arm the backup nudge.
  function onConfirm() {
    armBackupNudge();
    confirm();
  }

  // Reset the checkbox each time the dialog reopens. Otherwise an old
  // accept-state would carry across vaults.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset: synchronously clearing acknowledged when pending changes is the desired behavior to avoid stale checkbox state across vaults
    if (pending) setAcknowledged(false);
  }, [pending]);

  // Escape cancels — preserved from original. Modal's own Escape is gated
  // by isDismissable, which is false here (no overlay click), so we wire
  // it manually to keep the keyboard escape path open.
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
    <Modal
      open={!!pending}
      onClose={cancel}
      title={`Encrypt this ${kind}?`}
      isDismissable={false}
    >
      <EncryptDialogBody
        pending={pending}
        acknowledged={acknowledged}
        onAcknowledgeChange={setAcknowledged}
      />
      <EncryptDialogFooter
        kind={kind}
        acknowledged={acknowledged}
        onCancel={cancel}
        onConfirm={onConfirm}
      />
    </Modal>
  );
}
