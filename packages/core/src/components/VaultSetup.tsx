import { useEffect, useMemo, useState } from "react";
import { useCryptoStore } from "../stores/cryptoStore";
import { createDeviceIdentity, loadDeviceIdentity } from "../lib/crypto/device-key";
import {
  generateRecoveryMnemonic,
  recoveryFromMnemonic,
} from "../lib/crypto/recovery";
import { initVault } from "../lib/secrets-vault";

type Step = "intro" | "show-phrase" | "confirm-phrase" | "working" | "done";

export function VaultSetup() {
  const setPhase = useCryptoStore((s) => s.setPhase);
  const setDevice = useCryptoStore((s) => s.setDevice);
  const setError = useCryptoStore((s) => s.setError);

  const [step, setStep] = useState<Step>("intro");
  const [mnemonic, setMnemonic] = useState<string>("");
  const [confirmInput, setConfirmInput] = useState<string>("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — fall back silently; the on-screen words still work
    }
  }

  // Pick 3 indices to challenge on
  const challengeIndices = useMemo(() => {
    const all = Array.from({ length: 24 }, (_, i) => i);
    const shuffled = all.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3).sort((a, b) => a - b);
  }, [mnemonic]);

  useEffect(() => {
    if (step === "show-phrase" && !mnemonic) {
      setMnemonic(generateRecoveryMnemonic());
    }
  }, [step, mnemonic]);

  const words = mnemonic ? mnemonic.split(" ") : [];

  async function onComplete() {
    setBusy(true);
    try {
      const existing = await loadDeviceIdentity();
      const device = existing ?? (await createDeviceIdentity());
      const { recipient } = await recoveryFromMnemonic(mnemonic);
      await initVault({ device, recoveryRecipient: recipient });
      setDevice(device);
      setStep("done");
      setTimeout(() => setPhase("ready"), 600);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onCheckConfirm() {
    const tokens = confirmInput.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    const expected = challengeIndices.map((i) => words[i]);
    if (tokens.length !== expected.length) {
      setConfirmError(`Type the ${expected.length} words, separated by spaces.`);
      return;
    }
    for (let i = 0; i < expected.length; i++) {
      if (tokens[i] !== expected[i]) {
        setConfirmError(
          `Word #${challengeIndices[i]! + 1} doesn't match. Check your backup.`,
        );
        return;
      }
    }
    setConfirmError(null);
    void onComplete();
  }

  return (
    <div className="nk-modal-backdrop">
      <div className="nk-modal nk-vault-setup">
        {step === "intro" && (
          <>
            <h2>Set up your encrypted vault</h2>
            <p>
              NoteKit can store API keys (e.g. for AI features) encrypted in
              your GitHub vault. Neither GitHub nor the NoteKit server can read
              them — only your devices can.
            </p>
            <p className="nk-muted">
              We'll generate a 24-word recovery phrase. Write it down on paper.
              If you lose all your devices, this phrase is the only way back
              in.
            </p>
            <div className="nk-modal-actions">
              <button
                className="nk-btn nk-btn--primary"
                onClick={() => setStep("show-phrase")}
              >
                Get started
              </button>
            </div>
          </>
        )}

        {step === "show-phrase" && (
          <>
            <div className="nk-mnemonic-hd">
              <h2>Your recovery phrase</h2>
              <button
                type="button"
                className="nk-btn"
                onClick={onCopy}
                title="Copy to clipboard. Paste only into an offline password manager — never into chat, notes, or anything that syncs to the cloud."
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="nk-muted">
              Write these 24 words down in order. Paper is safest; a local
              password manager is acceptable. Do not save into anything that
              syncs to the cloud unencrypted.
            </p>
            <ol className="nk-mnemonic-grid">
              {words.map((w, i) => (
                <li key={i}>
                  <span className="nk-mnemonic-num">{i + 1}</span>
                  <span className="nk-mnemonic-word">{w}</span>
                </li>
              ))}
            </ol>
            <div className="nk-modal-actions">
              <button
                className="nk-btn"
                onClick={() => {
                  setMnemonic("");
                  setStep("intro");
                }}
              >
                Back
              </button>
              <button
                className="nk-btn nk-btn--primary"
                onClick={() => setStep("confirm-phrase")}
              >
                I've written it down
              </button>
            </div>
          </>
        )}

        {step === "confirm-phrase" && (
          <>
            <h2>Confirm your backup</h2>
            <p className="nk-muted">
              Type words{" "}
              <strong>
                {challengeIndices.map((i) => `#${i + 1}`).join(", ")}
              </strong>{" "}
              from your recovery phrase, separated by spaces.
            </p>
            <input
              className="nk-input"
              placeholder="word word word"
              autoFocus
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCheckConfirm();
              }}
              disabled={busy}
            />
            {confirmError && (
              <p className="nk-error-text">{confirmError}</p>
            )}
            <div className="nk-modal-actions">
              <button
                className="nk-btn"
                onClick={() => setStep("show-phrase")}
                disabled={busy}
              >
                Show phrase again
              </button>
              <button
                className="nk-btn nk-btn--primary"
                onClick={onCheckConfirm}
                disabled={busy}
              >
                {busy ? "Setting up…" : "Confirm & finish"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <h2>Vault ready</h2>
            <p>Your encrypted vault is set up on this device.</p>
          </>
        )}
      </div>
    </div>
  );
}
