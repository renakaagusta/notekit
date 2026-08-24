/**
 * Roster IO and Model B trust (per-device-key device management).
 *
 * The pure chain crypto lives in `crypto/roster.ts`; this module wires it to the
 * vault backend and git history. A roster is committed at
 * `.notekit/roster/{version}.json` — one file per version, so git keeps the full
 * version log (see "don't reinvent Git") and any device can read the ordered
 * chain to verify trust back to the TOFU-pinned master key.
 *
 * Migration-safe: a vault with NO roster keeps working under the legacy
 * recovery-signed device-record model. Model B only engages once a genesis
 * roster exists.
 *
 * Re-exported from secrets-vault.ts for external callers.
 */
import type { DeviceIdentity } from "./crypto/device-key";
import { keyboxSigningPayload } from "./crypto/keybox";
import type { RecoverySigningKey } from "./crypto/recovery";
import {
  type RosterDocument,
  type RosterEntry,
  signRoster,
  verifyRosterChain,
  rosterRecipients,
  isRosterDocument,
} from "./crypto/roster";
import { toB64, fromB64, verify } from "./crypto/signing";
import {
  backend,
  shaCache,
  readVaultFile,
  readVaultListing,
  readRecovery,
  unlockVaultKey,
  writeKeybox,
  readKeyboxEpoch,
  keyboxExists,
  configureKeyboxRosterVerifier,
  configureRosterRecipientsResolver,
} from "./secrets-vault-core";
import { rotateVaultKey } from "./secrets-vault-reencrypt";

export const ROSTER_PREFIX = ".notekit/roster/";

export function rosterVersionPath(version: number): string {
  // Zero-pad so a lexical listing is also chronological, matching how git
  // returns entries — keeps the read path simple without a separate index.
  return `${ROSTER_PREFIX}${String(version).padStart(6, "0")}.json`;
}

function parseRosterVersion(path: string): number | null {
  if (!path.startsWith(ROSTER_PREFIX) || !path.endsWith(".json")) return null;
  const raw = path.slice(ROSTER_PREFIX.length, -".json".length);
  const version = Number(raw);
  return Number.isInteger(version) && version > 0 ? version : null;
}

/** The device's Model B signer, or null if it predates the signing keypair. */
export function deviceSigner(
  device: DeviceIdentity,
): { signPub: string; signPriv: Uint8Array } | null {
  if (!device.signPublicKey || !device.signPrivateKey) return null;
  return { signPub: device.signPublicKey, signPriv: fromB64(device.signPrivateKey) };
}

/** Read every roster version, oldest→newest. Empty array if no roster exists. */
export async function readRosterChain(): Promise<RosterDocument[]> {
  const { entries } = await readVaultListing(ROSTER_PREFIX);
  const versions = entries
    .map((e) => ({ path: e.path, version: parseRosterVersion(e.path) }))
    .filter((e): e is { path: string; version: number } => e.version !== null)
    .sort((a, b) => a.version - b.version);
  const files = await Promise.all(versions.map((v) => readVaultFile(v.path)));
  const docs: RosterDocument[] = [];
  for (const file of files) {
    if (file.sha) shaCache.set(file.path, file.sha);
    if (typeof file.content !== "string") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.content);
    } catch {
      continue;
    }
    if (isRosterDocument(parsed)) docs.push(parsed);
  }
  return docs;
}

export async function rosterExists(): Promise<boolean> {
  return (await readRosterChain()).length > 0;
}

/**
 * The current, chain-verified roster — or null if this vault has no roster
 * (legacy mode). Fail-closed: throws if a roster exists but doesn't validate
 * back to the pinned master signing key.
 */
export async function currentRoster(): Promise<RosterDocument | null> {
  const chain = await readRosterChain();
  if (chain.length === 0) return null;
  const recovery = await readRecovery();
  if (!recovery?.signingKey) {
    throw new Error(
      "roster: vault has a device roster but no recovery signing key to anchor it — refusing to trust it.",
    );
  }
  return verifyRosterChain(chain, recovery.signingKey);
}

async function writeRosterVersion(doc: RosterDocument, message: string): Promise<void> {
  const path = rosterVersionPath(doc.version);
  const result = await backend.writeFile(
    path,
    JSON.stringify(doc, null, 2),
    message,
    shaCache.get(path),
  );
  shaCache.set(path, result.sha);
}

/**
 * Create the genesis roster (version 1), signed by the master. Adds the origin
 * device with its own generated signing key. The master is used ONLY here (and
 * at full recovery); it is never distributed to any device.
 */
export async function bootstrapGenesisRoster(
  device: DeviceIdentity,
  recoverySigning: RecoverySigningKey,
): Promise<RosterDocument> {
  const signer = deviceSigner(device);
  if (!signer) {
    throw new Error("roster: origin device has no signing key — cannot bootstrap a roster.");
  }
  const masterSignPub = toB64(recoverySigning.publicKey);
  const entry: RosterEntry = {
    deviceId: device.deviceId,
    name: device.name,
    signPub: signer.signPub,
    recipient: device.recipient,
    addedAt: new Date().toISOString(),
    vouchedBy: masterSignPub,
  };

  // Unlock the vault key BEFORE the roster exists, while the keybox is still
  // verified under the legacy master path — once the roster is written, the
  // keybox verifier demands a device signature the current keybox lacks.
  const hasKeybox = await keyboxExists();
  const vaultKey = hasKeybox ? await unlockVaultKey(device) : null;
  if (hasKeybox && !vaultKey) {
    throw new Error("roster: cannot unlock the keybox to re-sign it under Model B.");
  }
  const epoch = hasKeybox ? (await readKeyboxEpoch(device)) ?? 1 : 1;

  const doc = signRoster({ version: 1, entries: [entry] }, {
    signPub: masterSignPub,
    signPriv: recoverySigning.privateKey,
  });
  await writeRosterVersion(doc, "Bootstrap Model B device roster (genesis)");

  // Re-sign the envelope keybox with the origin DEVICE key so the keybox trust
  // path is Model B from now on (device-signed, master cold). Re-wrapped to the
  // roster recipients + recovery; the vault key is unchanged (no content
  // re-encryption). Legacy multi-mode vaults have no keybox — nothing to do.
  if (vaultKey) {
    const recipients = await rosterVaultRecipients(doc);
    await writeKeybox(vaultKey, recipients, "Re-sign keybox under Model B roster", {
      epoch,
      deviceSigner: signer,
    });
  }
  return doc;
}

/**
 * Publish a new roster version authored by an in-roster device. The device
 * signs with ITS OWN key — the master is not used. Caller supplies the full
 * next entry set (add or revoke already applied).
 */
export async function publishRosterVersion(
  device: DeviceIdentity,
  entries: RosterEntry[],
  message: string,
): Promise<RosterDocument> {
  const current = await currentRoster();
  if (!current) {
    throw new Error("roster: no genesis roster to extend — bootstrap one first.");
  }
  const signer = deviceSigner(device);
  if (!signer || !current.entries.some((e) => e.signPub === signer.signPub)) {
    throw new Error(
      "roster: this device is not a trusted roster member — it cannot add or revoke devices.",
    );
  }
  const doc = signRoster({ version: current.version + 1, entries }, signer);
  await writeRosterVersion(doc, message);
  return doc;
}

/**
 * The recipient set the vault key is wrapped to in Model B: every roster device
 * PLUS the recovery recipient, so the master can still open the keybox during
 * full recovery. The device signing keys never touch this set — recipients are
 * age (X25519) encryption keys only.
 */
async function rosterVaultRecipients(roster: RosterDocument): Promise<string[]> {
  const recipients = new Set<string>(rosterRecipients(roster));
  const recovery = await readRecovery();
  if (recovery) recipients.add(recovery.recipient);
  return Array.from(recipients);
}

/**
 * Add a device via the roster — no recovery phrase needed. An in-roster,
 * unlocked device: appends the new entry, publishes a device-signed roster
 * version, and re-wraps the (unchanged) vault key to the new device. O(1): the
 * content is never touched. The master key is not used.
 */
export async function addDeviceViaRoster(
  signer: DeviceIdentity,
  newDevice: { deviceId: string; name: string; recipient: string; signPub: string },
): Promise<void> {
  const current = await currentRoster();
  if (!current) throw new Error("roster: cannot add a device — this vault has no roster.");
  const signerKeys = deviceSigner(signer);
  if (!signerKeys || !current.entries.some((e) => e.signPub === signerKeys.signPub)) {
    throw new Error("roster: this device is not trusted — it cannot add a device.");
  }
  if (current.entries.some((e) => e.signPub === newDevice.signPub)) {
    throw new Error("roster: a device with this signing key is already trusted.");
  }
  const entry: RosterEntry = {
    deviceId: newDevice.deviceId,
    name: newDevice.name,
    signPub: newDevice.signPub,
    recipient: newDevice.recipient,
    addedAt: new Date().toISOString(),
    vouchedBy: signerKeys.signPub,
  };
  const nextEntries = [...current.entries, entry];
  await publishRosterVersion(signer, nextEntries, `Add device "${newDevice.name}" to roster`);

  const vaultKey = await unlockVaultKey(signer);
  if (!vaultKey) throw new Error("roster: cannot unlock the vault key to wrap for the new device.");
  const epoch = (await readKeyboxEpoch(signer)) ?? 1;
  const updated = await currentRoster();
  if (!updated) throw new Error("roster: lost the roster while adding a device.");
  const recipients = await rosterVaultRecipients(updated);
  await writeKeybox(vaultKey, recipients, `Wrap vault key for device "${newDevice.name}"`, {
    epoch,
    deviceSigner: signerKeys,
  });
}

/**
 * Revoke a device via the roster — no recovery phrase needed. An in-roster,
 * unlocked device: drops the entry, publishes a device-signed roster version,
 * and ROTATES the vault key (new DEK, re-seal keybox to the remaining devices,
 * re-encrypt content) so the revoked device's key can't open the new keybox.
 * The master key is not used and stays intact.
 */
export async function revokeDeviceViaRoster(
  signer: DeviceIdentity,
  revokedSignPub: string,
): Promise<void> {
  const current = await currentRoster();
  if (!current) throw new Error("roster: cannot revoke a device — this vault has no roster.");
  const signerKeys = deviceSigner(signer);
  if (!signerKeys || !current.entries.some((e) => e.signPub === signerKeys.signPub)) {
    throw new Error("roster: this device is not trusted — it cannot revoke a device.");
  }
  if (revokedSignPub === signerKeys.signPub) {
    throw new Error("roster: a device cannot revoke itself.");
  }
  const revoked = current.entries.find((e) => e.signPub === revokedSignPub);
  if (!revoked) throw new Error("roster: no such device in the roster.");
  const nextEntries = current.entries.filter((e) => e.signPub !== revokedSignPub);
  if (nextEntries.length === 0) {
    throw new Error("roster: refusing to revoke the last device — use full recovery instead.");
  }
  await publishRosterVersion(signer, nextEntries, `Revoke device "${revoked.name}" from roster`);
  await rotateVaultKey(signer, undefined, `after revoking "${revoked.name}"`, signerKeys);
}

// ─── Late-bound hooks into secrets-vault-core (avoid an import cycle) ─────────

/**
 * Verify the keybox signature under Model B: the keybox must be signed by a
 * device whose signing pubkey is in the current chain-verified roster.
 * Returns false ONLY when the vault has no roster (legacy fall-through);
 * fail-closed otherwise.
 */
async function verifyKeyboxAgainstRoster(payload: {
  epoch: number;
  recipient: string;
  sig?: string;
  signedBy?: string;
}): Promise<boolean> {
  const roster = await currentRoster();
  if (!roster) return false;
  if (!payload.sig || !payload.signedBy) {
    throw new Error("keybox: missing device signature in a roster (Model B) vault.");
  }
  if (!roster.entries.some((e) => e.signPub === payload.signedBy)) {
    throw new Error("keybox: signed by a device not present in the current roster.");
  }
  const ok = verify(
    keyboxSigningPayload({ epoch: payload.epoch, recipient: payload.recipient }),
    payload.sig,
    fromB64(payload.signedBy),
  );
  if (!ok) throw new Error("keybox: device signature does not verify against the roster.");
  return true;
}

async function resolveRosterRecipients(_device: DeviceIdentity): Promise<string[] | null> {
  const roster = await currentRoster();
  if (!roster) return null;
  return rosterVaultRecipients(roster);
}

configureKeyboxRosterVerifier(verifyKeyboxAgainstRoster);
configureRosterRecipientsResolver(resolveRosterRecipients);
