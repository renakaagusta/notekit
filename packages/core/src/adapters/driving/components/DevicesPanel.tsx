import { Bot, Globe, Monitor, Smartphone, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import {
  admitMember,
  mySafetyNumber,
  previewShare,
  revokeMember,
  type SharePreview,
} from "../../../composition/directory";
import {
  deviceKindLabel,
  inferDeviceKind,
  type DeviceKind,
} from "../../../domain/device-kind";
import type { DeviceIdentity } from "../../../lib/crypto/device-key";
import { recoverySigningFromMnemonic } from "../../../lib/crypto/recovery";
import type { RecoverySigningKey } from "../../../lib/crypto/recovery";
import { loadStoredRecovery } from "../../../lib/crypto/recovery-store";
import {
  bootstrapGenesisRoster,
  deviceRecordTrusted,
  keyboxExists,
  listDevices,
  readMembers,
  readRecovery,
  removeDevice,
  rosterEntryForDevice,
  rosterExists,
  revokeRosterDevice,
  type DeviceRecord,
  type MemberRecord,
} from "../../../lib/secrets-vault";
import { finishVaultImport } from "../../../lib/vault-e2ee";
import { useAuthStore } from "../stores/authStore";
import { useCryptoStore } from "../stores/cryptoStore";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";
import { SkeletonDeviceList } from "./Skeleton";
import { useConfirm } from "./useConfirm";
import { VaultApproveDevice } from "./VaultPairing";

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
function DeviceKindIcon({ kind }: { kind: DeviceKind }) {
  switch (kind) {
    case "desktop": return <Monitor size={16} aria-hidden />;
    case "web": return <Globe size={16} aria-hidden />;
    case "ios":
    case "android": return <Smartphone size={16} aria-hidden />;
    case "cli": return <Terminal size={16} aria-hidden />;
    case "mcp": return <Bot size={16} aria-hidden />;
  }
}

async function revokeDeviceWithRecovery(
  deviceId: string,
  device: DeviceIdentity,
): Promise<void> {
  try {
    await removeDevice(deviceId, device);
  } catch (e) {
    if (!/recovery phrase/i.test((e as Error).message)) throw e;
    const stored = await loadStoredRecovery();
    let signing = stored?.mnemonic
      ? await recoverySigningFromMnemonic(stored.mnemonic)
      : null;
    if (!signing) {
      const phrase = window.prompt(
        "Enter your 24-word recovery phrase to revoke a device (it re-signs the rotated keybox):",
      );
      signing = phrase?.trim()
        ? await recoverySigningFromMnemonic(phrase.trim())
        : null;
    }
    if (!signing) {
      throw new Error("Your recovery phrase is needed to revoke a device.");
    }
    await removeDevice(deviceId, device, signing);
  }
}

/**
 * Revoke a device the Model B way: an in-roster device drops it and rotates the
 * vault key with its OWN key — no recovery phrase. The revoke is forward-only
 * (see "don't reinvent Git"): the device loses access to future changes, but a
 * copy it already synced stays on its machine. Trust + rotation live in the core
 * op; this only resolves the chosen device to its roster signing key.
 */
async function revokeDeviceViaRosterFromPanel(
  deviceId: string,
  device: DeviceIdentity,
): Promise<void> {
  const entry = await rosterEntryForDevice(deviceId);
  if (!entry) {
    throw new Error("That device isn't in the current roster — cannot revoke it.");
  }
  await revokeRosterDevice(device, { signPub: entry.signPub, deviceId });
}

/**
 * One-time upgrade of an existing envelope vault to Model B: the device that
 * holds the master mnemonic signs the genesis roster, becoming its first
 * member. Non-destructive — the vault key is unchanged, so no content is
 * re-encrypted. Other devices join later by being re-vouched via the normal
 * one-click approve flow.
 */
function importResultMessage({ resealed, skipped }: { resealed: number; skipped: number }): string {
  if (skipped > 0) {
    return `Re-sealed ${resealed}. ${skipped} couldn't be opened here — run this on a device that already reads the original vault.`;
  }
  if (resealed > 0) {
    return `Re-sealed ${resealed} imported item${resealed === 1 ? "" : "s"} to this vault.`;
  }
  return "Nothing to re-seal — every item already belongs to this vault.";
}

/**
 * After copying notes in from another vault, re-seal them to THIS vault's key
 * in one batched commit so every device here can read them. Runs on the current
 * device — which must be a recipient of the source vault to open the imports.
 */
function ImportSection({ device }: { device: DeviceIdentity | null }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFinishImport() {
    if (!device) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      setStatus(importResultMessage(await finishVaultImport(device)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="nk-ai-section">
      <header className="nk-ai-section-hd">
        <h3>Imported notes</h3>
        <button className="nk-btn" onClick={onFinishImport} disabled={busy || !device}>
          Finish import
        </button>
      </header>
      <p className="nk-muted">
        Copied notes in from another vault? Re-seal them to this vault&apos;s key
        in one batch so every device here can read them. Safe to re-run.
      </p>
      {error && <p className="nk-error-text">{error}</p>}
      {status && <p className="nk-muted">{status}</p>}
    </section>
  );
}

async function upgradeToModelB(device: DeviceIdentity): Promise<void> {
  const stored = await loadStoredRecovery();
  if (!stored?.mnemonic) {
    throw new Error(
      "This device doesn't hold the recovery phrase. Upgrade from the device you set the vault up on, or unlock it here with your phrase first.",
    );
  }
  const recoverySigning = await recoverySigningFromMnemonic(stored.mnemonic);
  await bootstrapGenesisRoster(device, recoverySigning);
}

// eslint-disable-next-line max-lines-per-function -- React component that handles device listing, member management, revocation flows, and approval UI
export function DevicesPanel() {
  const phase = useCryptoStore((s) => s.phase);
  const device = useCryptoStore((s) => s.device);
  const account = useAuthStore((s) => s.user);
  const openBackupSheet = useRecoveryBackupStore((s) => s.openSheet);
  const { confirm, confirmDialog } = useConfirm();

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
  // Model B (per-device-key roster) state. `hasRoster` decides whether revoke
  // takes the roster path (device-signed, no phrase); `canUpgrade` offers the
  // one-time genesis bootstrap on an envelope vault that predates the roster.
  const [hasRoster, setHasRoster] = useState(false);
  const [canUpgrade, setCanUpgrade] = useState(false);

  const myMemberId = account?.email ?? null;

  async function refresh() {
    if (!device || phase !== "ready") return;
    setBusy(true);
    try {
      const [devs, mems, sn, rec, roster, keybox] = await Promise.all([
        listDevices(),
        readMembers(),
        mySafetyNumber(),
        readRecovery(),
        rosterExists(),
        keyboxExists(),
      ]);
      setDevices(devs);
      setMembers([...mems.values()]);
      setSafetyNumber(sn);
      setSigningKey(rec?.signingKey ?? null);
      setHasRoster(roster);
      // Offer the upgrade only on an envelope vault (has a keybox) that has a
      // signing root but no roster yet. The bootstrap itself re-checks that this
      // device holds the mnemonic and fails closed if it doesn't.
      setCanUpgrade(keybox && !roster && !!rec?.signingKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onUpgradeToModelB() {
    if (!device) return;
    const confirmed = await confirm({
      title: "Turn on per-device approvals?",
      description:
        "Afterwards you can approve or revoke a device from any trusted device without typing your recovery phrase. This is safe and non-destructive — nothing is re-encrypted.",
      confirmLabel: "Turn on",
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await upgradeToModelB(device);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh is async (fetches from vault), setState is called in a callback/async path not synchronously
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally omitted; effect triggers only on the listed values
  }, [device, phase, showApprove]);

  async function onRevokeDevice(deviceId: string, name: string) {
    if (!device) return;
    if (deviceId === device.deviceId) {
      setError("Use another device to revoke this one.");
      return;
    }
    const confirmed = await confirm({
      title: `Revoke "${name}"?`,
      description: "It loses access immediately. Rotate any stored API keys afterwards.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      // Model B vaults revoke with this device's own key (no phrase) and rotate
      // the vault key forward-only. Legacy vaults revoke directly (no prompt) or,
      // for envelope+signed vaults, via revokeDeviceWithRecovery's phrase prompt.
      if (hasRoster) {
        await revokeDeviceViaRosterFromPanel(deviceId, device);
      } else {
        await revokeDeviceWithRecovery(deviceId, device);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onRevokeMember(memberId: string) {
    const confirmed = await confirm({
      title: `Remove "${memberId}" from this vault?`,
      description:
        "Their devices lose access to future changes. Anything they've already synced stays on their machine — revocation is forward-only.",
      confirmLabel: "Remove member",
      destructive: true,
    });
    if (!confirmed) return;
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
    const idSuffix = d.deviceId.slice(-4);
    const kind = d.kind ?? inferDeviceKind(d.deviceId);
    return (
      <li key={d.deviceId} className="nk-device-item">
        {kind && (
          <span className="nk-device-icon" title={deviceKindLabel(kind)} aria-hidden>
            <DeviceKindIcon kind={kind} />
          </span>
        )}
        <div>
          <strong>{d.name}</strong>
          {kind && <span className="nk-pill nk-pill--kind">{deviceKindLabel(kind)}</span>}
          {d.deviceId === device?.deviceId && (
            <span className="nk-pill">this device</span>
          )}
          {/* In Model B, trust is the signed roster, not the device-record
              signature — so a roster-approved record legitimately has no
              recovery signature. Only flag "unverified" in the legacy
              (no-roster) signed-mode world, where an unsigned record really is
              a possible injected recipient. */}
          {!hasRoster && signingKey && !d.owner && !deviceRecordTrusted(d, signingKey) && (
            <span
              className="nk-pill nk-pill--warn"
              title="This device record isn't signed by your recovery key — it may have been injected. Revoke it if you don't recognise it."
            >
              unverified
            </span>
          )}
          <div className="nk-muted">
            Added {new Date(d.addedAt).toLocaleDateString()} · <span className="nk-device-id">···{idSuffix}</span>
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
      {confirmDialog}

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

      {canUpgrade && (
        <section className="nk-ai-section">
          <header className="nk-ai-section-hd">
            <h3>Per-device approvals</h3>
            <button
              className="nk-btn nk-btn--primary"
              onClick={onUpgradeToModelB}
              disabled={busy}
            >
              Turn on
            </button>
          </header>
          <p className="nk-muted">
            Approve or revoke a device from any trusted device without typing
            your recovery phrase. Your phrase then stays offline — needed only to
            recover the vault if you lose every device. This is safe and
            non-destructive; nothing is re-encrypted.
          </p>
        </section>
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

      <ImportSection device={device} />

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
// eslint-disable-next-line max-lines-per-function -- React component with multi-step member admission flow (lookup, preview, safety number confirm, admit)
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
