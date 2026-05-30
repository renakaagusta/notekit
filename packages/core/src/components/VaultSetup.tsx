import { useEffect, useRef, useState } from "react";
import { useCryptoStore } from "../stores/cryptoStore";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";
import { createDeviceIdentity, loadDeviceIdentity } from "../lib/crypto/device-key";
import {
  createAndStoreRecovery,
  loadStoredRecovery,
} from "../lib/crypto/recovery-store";
import { initVault } from "../lib/secrets-vault";

/**
 * Silent vault setup. No 24-word wall: we generate the recovery key, stash it
 * in the device's secure store, initialize the vault, and go straight to ready.
 * The user can back the phrase up later from the nudge / Secrets panel — and
 * is reminded to, once they actually encrypt something.
 *
 * Renders only a brief "setting up" beat (and an error fallback), so the user
 * effectively never sees a key ceremony on a fresh device.
 */
export function VaultSetup() {
  const setPhase = useCryptoStore((s) => s.setPhase);
  const setDevice = useCryptoStore((s) => s.setDevice);
  const setError = useCryptoStore((s) => s.setError);
  const refreshBackup = useRecoveryBackupStore((s) => s.refresh);

  const [failed, setFailed] = useState<string | null>(null);
  // Guard against React 18 StrictMode double-invoke creating two vaults.
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setFailed(null);
    try {
      const device = (await loadDeviceIdentity()) ?? (await createDeviceIdentity());
      // Reuse an existing on-device recovery copy if one is somehow already
      // present (e.g. a half-finished prior run); otherwise mint a fresh one.
      const recovery =
        (await loadStoredRecovery()) ?? (await createAndStoreRecovery());
      await initVault({ device, recoveryRecipient: recovery.recipient });
      setDevice(device);
      await refreshBackup();
      setPhase("ready");
    } catch (e) {
      // Don't flip the global phase to "error" — that would tear down the app
      // shell. Surface a local retry instead.
      setFailed((e as Error).message);
    }
  }

  if (!failed) {
    return (
      <div className="nk-modal-backdrop">
        <div className="nk-modal nk-vault-setup">
          <h2>Setting up your encrypted space…</h2>
          <p className="nk-muted">One moment — generating your keys on this device.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nk-modal-backdrop">
      <div className="nk-modal nk-vault-setup">
        <h2>Couldn't finish setup</h2>
        <p className="nk-error-text">{failed}</p>
        <div className="nk-modal-actions">
          <button className="nk-btn" onClick={() => setError(failed)}>
            Dismiss
          </button>
          <button
            className="nk-btn nk-btn--primary"
            onClick={() => {
              ranRef.current = false;
              void run();
            }}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
