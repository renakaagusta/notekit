import { useEffect, useRef, useState } from "react";
import { useCryptoStore } from "../stores/cryptoStore";
import {
  announcePair,
  fetchPair,
  clearPair,
} from "../lib/vault-api";
import { addDevice, listDevices, readRecovery } from "../lib/secrets-vault";
import { recoveryFromMnemonic } from "../lib/crypto/recovery";
import { importRecovery } from "../lib/crypto/recovery-store";
import { deriveFingerprint, formatFingerprint } from "../lib/crypto/fingerprint";
import { notifyDevicePaired } from "../lib/notifications-api";

/**
 * Derive the human-comparable pairing fingerprint for a pubkey. Both the new
 * device (from its own trusted local key) and the approving device (from the
 * server-relayed key) render this; matching them rules out a key swap by a
 * compromised server.
 */
function useFingerprint(pubkey: string | null | undefined): string | null {
  const [fp, setFp] = useState<string | null>(null);
  useEffect(() => {
    if (!pubkey) {
      setFp(null);
      return;
    }
    let cancelled = false;
    void deriveFingerprint(pubkey).then((slots) => {
      if (!cancelled) setFp(formatFingerprint(slots));
    });
    return () => {
      cancelled = true;
    };
  }, [pubkey]);
  return fp;
}

function PairingFingerprint({ value }: { value: string | null }) {
  return (
    <div className="nk-pair-fingerprint">
      <span className="nk-muted">Verify this matches on both devices</span>
      <strong className="nk-pair-fp-value" aria-live="polite">
        {value ?? "…"}
      </strong>
    </div>
  );
}

function randomCode(): string {
  // 6-digit pairing code from a cryptographically secure source, with
  // rejection sampling so the modulo is unbiased across [0, 1_000_000).
  // 4_294_000_000 is the largest multiple of 1e6 that fits in a uint32.
  const buf = new Uint32Array(1);
  const LIMIT = 4_294_000_000;
  do {
    crypto.getRandomValues(buf);
  } while (buf[0]! >= LIMIT);
  return (buf[0]! % 1_000_000).toString().padStart(6, "0");
}

/**
 * Shown on a NEW device after vault was already set up elsewhere.
 * Posts an announcement and polls for the device record to appear in the vault.
 */
export function VaultPairNewDevice() {
  const device = useCryptoStore((s) => s.device);
  const setPhase = useCryptoStore((s) => s.setPhase);
  const setError = useCryptoStore((s) => s.setError);
  const pairCode = useCryptoStore((s) => s.pairCode);
  const setPairCode = useCryptoStore((s) => s.setPairCode);

  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const fingerprint = useFingerprint(device?.recipient);

  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!device) return;
    if (pairCode) return;
    let cancelled = false;
    (async () => {
      const code = randomCode();
      try {
        await announcePair({
          code,
          pubkey: device.recipient,
          deviceName: device.name,
          deviceId: device.deviceId,
        });
        if (!cancelled) setPairCode(code);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [device, pairCode, setPairCode, setError]);

  useEffect(() => {
    if (!device || !pairCode) return;
    pollRef.current = window.setInterval(async () => {
      try {
        const devices = await listDevices();
        if (devices.some((d) => d.deviceId === device.deviceId)) {
          if (pollRef.current) clearInterval(pollRef.current);
          await clearPair(pairCode).catch(() => {});
          setPhase("ready");
        }
      } catch {
        // ignore transient errors during polling
      }
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [device, pairCode, setPhase]);

  async function onUseRecovery() {
    if (!device) return;
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      // We just validate the mnemonic produces the recovery key currently on
      // record. The actual decryption happens via secrets-vault using the
      // device identity once it's been registered.
      const { recipient } = await recoveryFromMnemonic(recoveryInput);
      const recovery = await readRecovery();
      if (!recovery || recovery.recipient !== recipient) {
        throw new Error("This phrase doesn't match the vault's recovery key.");
      }
      // Use a temporary signer composed of the recovery identity to write the
      // device record and re-encrypt secrets to include this device.
      const { identity } = await recoveryFromMnemonic(recoveryInput);
      await addDevice(
        {
          deviceId: device.deviceId,
          name: device.name,
          recipient: device.recipient,
        },
        {
          deviceId: "recovery",
          name: "recovery",
          identity,
          recipient,
          createdAt: new Date().toISOString(),
        },
      );
      // The user just typed the phrase, so they already hold a backup. Keep a
      // local copy on this device (marked backed-up) so the backup sheet works
      // here too and the nudge stays quiet.
      await importRecovery(recoveryInput).catch(() => {});
      // Security alert across the user's channels. Best-effort — pairing
      // already succeeded, so a notify failure must not block unlock.
      await notifyDevicePaired(device.deviceId, device.name).catch(() => {});
      setPhase("ready");
    } catch (e) {
      setRecoveryError((e as Error).message);
    } finally {
      setRecoveryBusy(false);
    }
  }

  return (
    <div className="nk-modal-backdrop">
      <div className="nk-modal nk-vault-pair">
        <h2>Pair this device</h2>
        <p>
          Your encrypted vault is already set up on another device. To grant
          this device access, open NoteKit on an existing one and enter the
          code below.
        </p>
        <div className="nk-pair-code" aria-live="polite">
          {pairCode ? formatCode(pairCode) : "…"}
        </div>
        <p className="nk-muted">
          On your other device: AI rail → <em>Pair new device</em>.
          Waiting for approval…
        </p>

        <PairingFingerprint value={fingerprint} />
        <p className="nk-muted nk-pair-fp-hint">
          Before approving, check the emoji code above matches the one shown on
          your other device. If they differ, cancel — someone may be
          intercepting the pairing.
        </p>

        <div className="nk-divider" />

        {!recoveryOpen ? (
          <button
            className="nk-btn"
            onClick={() => setRecoveryOpen(true)}
          >
            Use recovery phrase instead
          </button>
        ) : (
          <>
            <h3>Recover from phrase</h3>
            <p className="nk-muted">
              Enter your 24-word recovery phrase to unlock without another
              device.
            </p>
            <textarea
              className="nk-textarea"
              rows={3}
              placeholder="word word word …"
              value={recoveryInput}
              onChange={(e) => setRecoveryInput(e.target.value)}
              disabled={recoveryBusy}
            />
            {recoveryError && (
              <p className="nk-error-text">{recoveryError}</p>
            )}
            <div className="nk-modal-actions">
              <button
                className="nk-btn"
                onClick={() => setRecoveryOpen(false)}
                disabled={recoveryBusy}
              >
                Cancel
              </button>
              <button
                className="nk-btn nk-btn--primary"
                onClick={onUseRecovery}
                disabled={recoveryBusy || !recoveryInput.trim()}
              >
                {recoveryBusy ? "Unlocking…" : "Unlock"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatCode(code: string): string {
  return code.replace(/(\d{3})(\d{3})/, "$1 $2");
}

interface ApproveProps {
  onClose(): void;
}

/**
 * Existing-device side. Enter the code shown on the new device, confirm
 * details, approve.
 */
export function VaultApproveDevice({ onClose }: ApproveProps) {
  const signer = useCryptoStore((s) => s.device);
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<{
    pubkey: string;
    deviceName: string;
    deviceId: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived from the server-relayed pubkey. The human compares it against the
  // new device's screen to detect a swapped key.
  const fingerprint = useFingerprint(info?.pubkey);

  async function onFetch() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetchPair(code.trim());
      if (!res) throw new Error("Code not found or expired.");
      setInfo({
        pubkey: res.pubkey,
        deviceName: res.deviceName,
        deviceId: res.deviceId,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onApprove() {
    if (!info || !signer) return;
    setBusy(true);
    setError(null);
    try {
      await addDevice(
        {
          deviceId: info.deviceId,
          name: info.deviceName,
          recipient: info.pubkey,
        },
        signer,
      );
      await clearPair(code.trim()).catch(() => {});
      // Security alert across the user's channels. Best-effort — the device is
      // already paired, so a notify failure must not block closing the dialog.
      await notifyDevicePaired(info.deviceId, info.deviceName).catch(() => {});
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="nk-modal-backdrop">
      <div className="nk-modal nk-vault-pair">
        <h2>Pair new device</h2>
        {!info ? (
          <>
            <p>Enter the 6-digit code shown on the new device.</p>
            <input
              className="nk-input"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              disabled={busy}
              autoFocus
            />
            {error && <p className="nk-error-text">{error}</p>}
            <div className="nk-modal-actions">
              <button className="nk-btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                className="nk-btn nk-btn--primary"
                onClick={onFetch}
                disabled={busy || code.length !== 6}
              >
                {busy ? "Looking up…" : "Continue"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Approve this device?</p>
            <div className="nk-pair-info">
              <div>
                <span className="nk-muted">Name</span>
                <strong>{info.deviceName}</strong>
              </div>
              <div>
                <span className="nk-muted">Pubkey</span>
                <code className="nk-pair-pubkey">
                  {info.pubkey.slice(0, 16)}…{info.pubkey.slice(-8)}
                </code>
              </div>
            </div>
            <PairingFingerprint value={fingerprint} />
            <p className="nk-muted nk-pair-fp-hint">
              Only approve if this emoji code matches what's shown on the new
              device. A mismatch means the key was tampered with in transit —
              cancel and try again.
            </p>
            {error && <p className="nk-error-text">{error}</p>}
            <div className="nk-modal-actions">
              <button
                className="nk-btn"
                onClick={() => setInfo(null)}
                disabled={busy}
              >
                Back
              </button>
              <button
                className="nk-btn nk-btn--primary"
                onClick={onApprove}
                disabled={busy}
              >
                {busy ? "Approving…" : "Approve"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
