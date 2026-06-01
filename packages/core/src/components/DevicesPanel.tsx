import { useEffect, useState } from "react";
import { useCryptoStore } from "../stores/cryptoStore";
import {
  listDevices,
  removeDevice,
  type DeviceRecord,
} from "../lib/secrets-vault";
import { VaultApproveDevice } from "./VaultPairing";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";
import { SkeletonDeviceList } from "./Skeleton";

/**
 * Devices & recovery management, opened from the account menu.
 *
 * This is the home for the device-pairing approve flow ("Pair new device")
 * and the recovery-phrase backup — the AI-key bits live in the (currently
 * unused) AIVaultPanel. Pairing only makes sense once this device holds the
 * vault key, so anything other than the `ready` phase shows a short hint.
 */
export function DevicesPanel() {
  const phase = useCryptoStore((s) => s.phase);
  const device = useCryptoStore((s) => s.device);
  const openBackupSheet = useRecoveryBackupStore((s) => s.openSheet);

  const [devices, setDevices] = useState<DeviceRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApprove, setShowApprove] = useState(false);

  async function refresh() {
    if (!device || phase !== "ready") return;
    setBusy(true);
    try {
      setDevices(await listDevices());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device, phase, showApprove]);

  async function onRevokeDevice(deviceId: string, name: string) {
    if (!device) return;
    if (deviceId === device.deviceId) {
      window.alert("Use another device to revoke this one.");
      return;
    }
    if (
      !window.confirm(
        `Revoke "${name}"? It loses access immediately. Rotate any stored API keys afterwards.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await removeDevice(deviceId, device);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (phase !== "ready") {
    return (
      <div className="nk-empty">
        <p>{phaseCopy(phase)}</p>
      </div>
    );
  }

  return (
    <div className="nk-devices-panel">
      {error && <div className="nk-error-text">{error}</div>}

      <section className="nk-ai-section">
        <header className="nk-ai-section-hd">
          <h3>Paired devices</h3>
          <button className="nk-btn" onClick={() => setShowApprove(true)}>
            Pair new device
          </button>
        </header>
        {devices === null ? (
          <SkeletonDeviceList />
        ) : (
          <ul className="nk-device-list">
            {devices.map((d) => (
              <li key={d.deviceId} className="nk-device-item">
                <div>
                  <strong>{d.name}</strong>
                  {d.deviceId === device?.deviceId && (
                    <span className="nk-pill">this device</span>
                  )}
                  <div className="nk-muted">
                    Added {new Date(d.addedAt).toLocaleDateString()}
                  </div>
                </div>
                {d.deviceId !== device?.deviceId && (
                  <button
                    className="nk-btn nk-btn--danger"
                    onClick={() => onRevokeDevice(d.deviceId, d.name)}
                    disabled={busy}
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="nk-ai-section">
        <header className="nk-ai-section-hd">
          <h3>Recovery key</h3>
          <button className="nk-btn" onClick={openBackupSheet}>
            Back up recovery phrase
          </button>
        </header>
        <p className="nk-muted">
          Your 24-word recovery phrase unlocks the vault if you lose every
          paired device. Keep a copy somewhere safe and offline.
        </p>
      </section>

      {showApprove && (
        <VaultApproveDevice onClose={() => setShowApprove(false)} />
      )}
    </div>
  );
}

function phaseCopy(phase: string): string {
  switch (phase) {
    case "idle":
      return "Connect a Git vault to manage encrypted devices.";
    case "checking":
      return "Checking vault…";
    case "needs-setup":
      return "Set up the encrypted vault first to pair other devices.";
    case "needs-pair":
      return "This device isn't paired yet.";
    case "waiting-approval":
      return "Waiting for approval from your other device…";
    case "error":
      return "Vault error.";
    default:
      return "Loading…";
  }
}
