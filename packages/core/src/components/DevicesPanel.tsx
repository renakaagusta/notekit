import { useEffect, useState } from "react";
import { useCryptoStore } from "../stores/cryptoStore";
import { useAuthStore } from "../stores/authStore";
import {
  deviceRecordTrusted,
  listDevices,
  readMembers,
  readRecovery,
  removeDevice,
  type DeviceRecord,
  type MemberRecord,
} from "../lib/secrets-vault";
import { VaultApproveDevice } from "./VaultPairing";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";
import {
  admitMember,
  mySafetyNumber,
  previewShare,
  revokeMember,
  type SharePreview,
} from "../lib/directory";
import { loadStoredRecovery } from "../lib/crypto/recovery-store";
import { recoverySigningFromMnemonic } from "../lib/crypto/recovery";
import type { RecoverySigningKey } from "../lib/crypto/recovery";
import { SkeletonDeviceList } from "./Skeleton";

/**
 * Devices, members & recovery management, opened from the account menu.
 *
 * Two worlds share this panel:
 *  - Legacy / single-user signed vaults → a flat "Paired devices" list +
 *    the device-pairing approve flow ("Pair new device").
 *  - Member vaults (first-class membership) → devices grouped by member,
 *    an "Add member" flow gated on an out-of-band safety-number check, and
 *    per-member revoke. WhatsApp-grade: adding your *own* device stays a
 *    one-tap approval (no phrase); only admitting another *person* asks you
 *    to confirm their emoji safety number.
 */
export function DevicesPanel() {
  const phase = useCryptoStore((s) => s.phase);
  const device = useCryptoStore((s) => s.device);
  const account = useAuthStore((s) => s.user);
  const openBackupSheet = useRecoveryBackupStore((s) => s.openSheet);

  const [devices, setDevices] = useState<DeviceRecord[] | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  // Recovery signing key (signed-mode vaults) used to flag any device record
  // whose signature doesn't verify — a possible injected recipient — and to
  // gate the member features (legacy unsigned vaults don't get them).
  const [signingKey, setSigningKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApprove, setShowApprove] = useState(false);

  const myMemberId = account?.email ?? null;

  async function refresh() {
    if (!device || phase !== "ready") return;
    setBusy(true);
    try {
      const [devs, mems, sn, rec] = await Promise.all([
        listDevices(),
        readMembers(),
        mySafetyNumber(),
        readRecovery(),
      ]);
      setDevices(devs);
      setMembers([...mems.values()]);
      setSafetyNumber(sn);
      setSigningKey(rec?.signingKey ?? null);
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

  async function onRevokeMember(memberId: string) {
    if (
      !window.confirm(
        `Remove "${memberId}" from this vault? Their devices lose access to future changes. (Anything they've already synced stays on their machine — revocation is forward-only.)`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await revokeMember(memberId);
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

  const memberCapable = !!signingKey; // member features need a signed-mode vault
  const memberMode = members.length > 0;
  const otherMembers = members.filter(
    (m) => m.role !== "owner" && m.memberId !== myMemberId,
  );

  // Group devices by the member that owns them. Anything owned by me, or with
  // no owner (pre-membership records), lands under "My devices".
  function devicesOf(memberId: string | null): DeviceRecord[] {
    if (!devices) return [];
    if (memberId === null) {
      return devices.filter((d) => !d.owner || d.owner === myMemberId);
    }
    return devices.filter((d) => d.owner === memberId);
  }

  function renderDevice(d: DeviceRecord) {
    return (
      <li key={d.deviceId} className="nk-device-item">
        <div>
          <strong>{d.name}</strong>
          {d.deviceId === device?.deviceId && (
            <span className="nk-pill">this device</span>
          )}
          {signingKey && !d.owner && !deviceRecordTrusted(d, signingKey) && (
            <span
              className="nk-pill nk-pill--warn"
              title="This device record isn't signed by your recovery key — it may have been injected. Revoke it if you don't recognise it."
            >
              unverified
            </span>
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
    );
  }

  return (
    <div className="nk-devices-panel">
      {error && <div className="nk-error-text">{error}</div>}

      {memberMode ? (
        <>
          <section className="nk-ai-section">
            <header className="nk-ai-section-hd">
              <h3>My devices</h3>
              <button className="nk-btn" onClick={() => setShowApprove(true)}>
                Link a device
              </button>
            </header>
            {devices === null ? (
              <SkeletonDeviceList />
            ) : (
              <ul className="nk-device-list">{devicesOf(null).map(renderDevice)}</ul>
            )}
          </section>

          {otherMembers.map((m) => (
            <section className="nk-ai-section" key={m.memberId}>
              <header className="nk-ai-section-hd">
                <h3>
                  {m.displayName || m.memberId}{" "}
                  <span className="nk-pill">member</span>
                </h3>
                <button
                  className="nk-btn nk-btn--danger"
                  onClick={() => onRevokeMember(m.memberId)}
                  disabled={busy}
                >
                  Remove member
                </button>
              </header>
              <ul className="nk-device-list">{devicesOf(m.memberId).map(renderDevice)}</ul>
            </section>
          ))}
        </>
      ) : (
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
            <ul className="nk-device-list">{devices.map(renderDevice)}</ul>
          )}
        </section>
      )}

      {memberCapable && (
        <AddMember
          owner={
            myMemberId
              ? { memberId: myMemberId, displayName: account?.name ?? undefined, email: myMemberId }
              : null
          }
          onAdmitted={refresh}
        />
      )}

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

      {safetyNumber && (
        <section className="nk-ai-section">
          <header className="nk-ai-section-hd">
            <h3>Your safety number</h3>
          </header>
          <p className="nk-safety-number">{safetyNumber}</p>
          <p className="nk-muted">
            When someone adds you to a vault or shares an encrypted item, they'll
            see this same safety number. Read it to them (or compare in person) to
            confirm no one has substituted your key.
          </p>
        </section>
      )}

      {showApprove && (
        <VaultApproveDevice onClose={() => setShowApprove(false)} />
      )}
    </div>
  );
}

/**
 * Admit another person into the vault. Two-step on purpose: look up their
 * published keys and show their emoji safety number, then require the operator
 * to confirm they checked it out-of-band before committing. That confirmation
 * is the whole trust anchor — without it, `owner` is just a forgeable label.
 */
function AddMember({
  owner,
  onAdmitted,
}: {
  owner: { memberId: string; displayName?: string; email?: string } | null;
  onAdmitted: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<SharePreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setPreview(null);
    setChecked(false);
    setError(null);
    setDone(null);
  }

  async function onLookup() {
    setError(null);
    setDone(null);
    setPreview(null);
    setChecked(false);
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    setLooking(true);
    try {
      const p = await previewShare(addr);
      if (!p) {
        setError(
          `No NoteKit user with published keys at ${addr}. They need to sign in to NoteKit (and set up their vault) first.`,
        );
        return;
      }
      setPreview(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLooking(false);
    }
  }

  async function ownerSigning(): Promise<RecoverySigningKey | null> {
    const stored = await loadStoredRecovery();
    if (stored?.mnemonic) return recoverySigningFromMnemonic(stored.mnemonic);
    // Secondary device without the phrase on it — ask for it once.
    const phrase = window.prompt(
      "Enter your 24-word recovery phrase to admit a member (it signs the membership record):",
    );
    if (!phrase?.trim()) return null;
    return recoverySigningFromMnemonic(phrase.trim());
  }

  async function onAdmit() {
    if (!preview || !owner) return;
    setBusy(true);
    setError(null);
    try {
      const signing = await ownerSigning();
      if (!signing) {
        setError("Your recovery phrase is needed to admit a member.");
        return;
      }
      const res = await admitMember(preview.email, signing, owner);
      if (!res.admitted) {
        setError(admitFailureCopy(res.reason));
        return;
      }
      setDone(
        `${preview.email} added — ${res.devicesAdded} device${res.devicesAdded === 1 ? "" : "s"} can now read this vault.`,
      );
      await onAdmitted();
      setPreview(null);
      setChecked(false);
      setEmail("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <section className="nk-ai-section">
        <header className="nk-ai-section-hd">
          <h3>Members</h3>
          <button className="nk-btn" onClick={() => setOpen(true)} disabled={!owner}>
            Add member
          </button>
        </header>
        <p className="nk-muted">
          Add another person by email so they can read this vault from their own
          devices — no pairing needed on their end.
        </p>
        {!owner && (
          <p className="nk-muted">Sign in to add members.</p>
        )}
      </section>
    );
  }

  return (
    <section className="nk-ai-section">
      <header className="nk-ai-section-hd">
        <h3>Add member</h3>
        <button
          className="nk-btn"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          Done
        </button>
      </header>

      {done && <div className="nk-success-text">{done}</div>}
      {error && <div className="nk-error-text">{error}</div>}

      <div className="nk-field-row">
        <input
          className="nk-input"
          type="email"
          placeholder="their@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onLookup()}
          disabled={looking || busy}
        />
        <button className="nk-btn" onClick={onLookup} disabled={looking || busy || !email.trim()}>
          {looking ? "Looking up…" : "Look up"}
        </button>
      </div>

      {preview && (
        <div className="nk-member-preview">
          <p className="nk-muted">
            Confirm this is really <strong>{preview.email}</strong> by checking the
            safety number below matches what they see on their device
            (under <em>Your safety number</em>). Read it over a call or compare in
            person — don't trust the screen alone.
          </p>
          <p className="nk-safety-number">{preview.safetyNumber}</p>
          <p className="nk-muted">
            {preview.recipientCount} device
            {preview.recipientCount === 1 ? "" : "s"} will be granted access.
            {preview.rejected > 0 &&
              ` (${preview.rejected} unverifiable record${preview.rejected === 1 ? "" : "s"} ignored.)`}
          </p>
          <label className="nk-checkbox-row">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            I've verified this safety number with {preview.email}.
          </label>
          <button
            className="nk-btn nk-btn--primary"
            onClick={onAdmit}
            disabled={!checked || busy}
          >
            {busy ? "Adding…" : "Add member"}
          </button>
        </div>
      )}
    </section>
  );
}

function admitFailureCopy(reason: string | undefined): string {
  switch (reason) {
    case "not_found":
      return "That user hasn't published any keys yet.";
    case "no_verified_keys":
      return "None of their published devices could be verified — ask them to re-publish from an up-to-date app.";
    case "no_devices":
      return "Their app is too old to be added as a member (no device attribution). Ask them to update NoteKit.";
    case "no_identity":
      return "This device has no vault identity to act with.";
    default:
      return "Could not add this member.";
  }
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
