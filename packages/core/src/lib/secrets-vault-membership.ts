/**
 * Device and member management: add/remove devices and members, self-register,
 * ensure owner membership. All content re-encryption after membership changes
 * is delegated to secrets-vault-reencrypt.ts.
 *
 * Re-exported from secrets-vault.ts for external callers.
 */
import type { DeviceIdentity } from "./crypto/device-key";
import type { RecoverySigningKey } from "./crypto/recovery";
import {
  shaCache,
  backend,
  listDevices,
  readMembers,
  readRecovery,
  writeDeviceRecord,
  writeMemberRecord,
  buildDeviceRecord,
  buildMemberRecord,
  devicePath,
  memberPath,
  ensureSha,
  collectVaultRecipients,
  collectRecipients,
  unlockVaultKey,
  keyboxExists,
  writeKeybox,
  writeAuthorityGrant,
  readKeyboxEpoch,
  deviceRecordTrusted,
  type DeviceRecord,
  toB64,
} from "./secrets-vault-core";
import {
  reEncryptAll,
  reencryptAllItems,
  reEncryptChats,
  rotateVaultKey,
} from "./secrets-vault-reencrypt";

export interface ForeignDeviceRecord {
  deviceId: string;
  name?: string;
  recipient: string;
  addedAt: string;
  owner?: string;
  sig?: string;
}

export interface SelfRegisterResult {
  registered: boolean;
  reason?:
    | "not_member_mode"
    | "not_a_member"
    | "signing_key_mismatch"
    | "already_registered";
}

export async function addDevice(
  newDevice: { deviceId: string; name: string; recipient: string },
  signer: DeviceIdentity,
  recoverySigning?: RecoverySigningKey,
): Promise<void> {
  const now = new Date().toISOString();
  const recovery = await readRecovery();
  if (recovery?.signingKey && !recoverySigning) {
    throw new Error(
      "This vault requires the recovery phrase to approve a new device (it signs the device record).",
    );
  }
  let owner: string | undefined;
  if (recoverySigning) {
    const members = await readMembers();
    const signerKeyB64 = toB64(recoverySigning.publicKey);
    for (const m of members.values()) {
      if (m.signingKey === signerKeyB64) { owner = m.memberId; break; }
    }
  }
  await writeDeviceRecord(
    buildDeviceRecord(
      { deviceId: newDevice.deviceId, name: newDevice.name, recipient: newDevice.recipient, addedAt: now },
      recoverySigning,
      owner,
    ),
    `Add device "${newDevice.name}"`,
  );

  // WhatsApp-style linking: the approver holds the signing key, and this is
  // another OWNER device of the same user, so hand it a per-device authority
  // grant. The new device can then enrol further devices phrase-free. Sealed to
  // that device only (not the shared keybox), so members/agents never get it.
  if (recoverySigning) {
    await writeAuthorityGrant(
      recoverySigning,
      newDevice.recipient,
      newDevice.deviceId,
      `Grant device "${newDevice.name}" authority to approve devices`,
    );
  }

  const vaultKey = await unlockVaultKey(signer);
  if (vaultKey) {
    const epoch = (await readKeyboxEpoch(signer)) ?? 1;
    const recipients = await collectVaultRecipients(signer);
    await writeKeybox(
      vaultKey,
      recipients,
      `Add device "${newDevice.name}" to keybox`,
      { epoch, recoverySigning },
    );
    return;
  }

  const recipients = await collectRecipients(signer);
  await reEncryptAll(
    signer,
    recipients,
    (r) => {
      const label = r.vault ? `${r.vault}/${r.name}` : r.name;
      return `Re-encrypt secret "${label}" for device "${newDevice.name}"`;
    },
  );
  await reencryptAllItems(
    signer,
    recipients,
    (kind, id) =>
      `Re-encrypt ${kind} "${id}" for device "${newDevice.name}"`,
  );
  await reEncryptChats(signer, recipients);
}

export async function removeDevice(
  deviceId: string,
  signer: DeviceIdentity,
  recoverySigning?: RecoverySigningKey,
): Promise<void> {
  const path = devicePath(deviceId);
  const file = await backend.readFile(path);
  if (!file.sha) return;
  let removedName = deviceId;
  if (typeof file.content === "string") {
    try { removedName = (JSON.parse(file.content) as DeviceRecord).name ?? deviceId; } catch { /* keep id */ }
  }
  const recovery = await readRecovery();
  const envelope = await keyboxExists();
  if (envelope && recovery?.signingKey && !recoverySigning) {
    throw new Error(
      "This vault requires the recovery phrase to revoke a device (it re-signs the rotated keybox).",
    );
  }
  await backend.deleteFile(path, file.sha, `Revoke device "${removedName}"`);
  shaCache.delete(path);

  if (envelope) {
    await rotateVaultKey(signer, recoverySigning, `after revoking "${removedName}"`);
    return;
  }

  const recipients = await collectRecipients(signer);
  await reEncryptAll(
    signer,
    recipients,
    (r) => {
      const label = r.vault ? `${r.vault}/${r.name}` : r.name;
      return `Re-encrypt secret "${label}" after revoking "${removedName}"`;
    },
  );
  await reencryptAllItems(
    signer,
    recipients,
    (kind, id) =>
      `Re-encrypt ${kind} "${id}" after revoking "${removedName}"`,
  );
  await reEncryptChats(signer, recipients);
}

export async function ensureOwnerMember(
  owner: { memberId: string; displayName?: string; email?: string },
  ownerSigning: RecoverySigningKey,
): Promise<void> {
  const ownerKeyB64 = toB64(ownerSigning.publicKey);
  const members = await readMembers();
  if (!members.has(owner.memberId)) {
    const recovery = await readRecovery();
    const now = new Date().toISOString();
    await writeMemberRecord(
      buildMemberRecord(
        {
          memberId: owner.memberId,
          displayName: owner.displayName,
          email: owner.email,
          signingKey: ownerKeyB64,
          role: "owner",
          addedAt: recovery?.createdAt ?? now,
          addedBy: owner.memberId,
        },
        ownerSigning,
      ),
      `Register owner "${owner.memberId}" as vault member`,
    );
  }
  const devices = await listDevices();
  for (const d of devices) {
    if (d.owner) continue;
    if (!deviceRecordTrusted(d, ownerKeyB64)) continue;
    await writeDeviceRecord(
      buildDeviceRecord(
        { deviceId: d.deviceId, name: d.name, recipient: d.recipient, addedAt: d.addedAt },
        ownerSigning,
        owner.memberId,
      ),
      `Attribute device "${d.name}" to owner "${owner.memberId}"`,
    );
  }
}

export async function ensureSelfRegistered(
  account: { memberId: string },
  device: DeviceIdentity,
  signing: RecoverySigningKey,
): Promise<SelfRegisterResult> {
  const members = await readMembers();
  if (members.size === 0) return { registered: false, reason: "not_member_mode" };
  const me = members.get(account.memberId);
  if (!me) return { registered: false, reason: "not_a_member" };
  if (me.signingKey !== toB64(signing.publicKey)) {
    return { registered: false, reason: "signing_key_mismatch" };
  }
  const devices = await listDevices();
  if (devices.some((d) => d.deviceId === device.deviceId)) {
    return { registered: false, reason: "already_registered" };
  }
  await writeDeviceRecord(
    buildDeviceRecord(
      {
        deviceId: device.deviceId,
        name: device.name,
        recipient: device.recipient,
        addedAt: new Date().toISOString(),
      },
      signing,
      account.memberId,
    ),
    `Self-register device "${device.name}" for member "${account.memberId}"`,
  );
  return { registered: true };
}

// eslint-disable-next-line max-lines-per-function -- member admission involves device verification, keybox update, and content re-encryption; splitting would fragment the atomic operation
export async function addMember(
  member: {
    memberId: string;
    displayName?: string;
    email?: string;
    signingKey: string;
  },
  deviceRecords: ForeignDeviceRecord[],
  signer: DeviceIdentity,
  ownerSigning: RecoverySigningKey,
): Promise<{ devicesAdded: number; devicesSkipped: number }> {
  const now = new Date().toISOString();
  const members = await readMembers();
  const ownerKeyB64 = toB64(ownerSigning.publicKey);
  let addedBy: string | undefined;
  for (const m of members.values()) {
    if (m.signingKey === ownerKeyB64) { addedBy = m.memberId; break; }
  }
  await writeMemberRecord(
    buildMemberRecord(
      {
        memberId: member.memberId,
        displayName: member.displayName,
        email: member.email,
        signingKey: member.signingKey,
        role: "member",
        addedAt: now,
        addedBy,
      },
      ownerSigning,
    ),
    `Add member "${member.memberId}"`,
  );
  let devicesAdded = 0;
  let devicesSkipped = 0;
  for (const d of deviceRecords) {
    const record: DeviceRecord = {
      deviceId: d.deviceId,
      name: d.name ?? member.displayName ?? member.memberId,
      recipient: d.recipient,
      addedAt: d.addedAt,
      owner: member.memberId,
      sig: d.sig,
    };
    if (!record.owner || record.owner !== member.memberId || !deviceRecordTrusted(record, member.signingKey)) {
      devicesSkipped++;
      continue;
    }
    await writeDeviceRecord(record, `Add device "${record.name}" for member "${member.memberId}"`);
    devicesAdded++;
  }

  if (await keyboxExists()) {
    const vaultKey = await unlockVaultKey(signer);
    if (vaultKey) {
      const epoch = (await readKeyboxEpoch(signer)) ?? 1;
      const recipients = await collectVaultRecipients(signer);
      await writeKeybox(
        vaultKey,
        recipients,
        `Add member "${member.memberId}" to keybox`,
        { epoch, recoverySigning: ownerSigning },
      );
    }
    return { devicesAdded, devicesSkipped };
  }

  const recipients = await collectRecipients(signer);
  await reEncryptAll(
    signer,
    recipients,
    (r) => {
      const label = r.vault ? `${r.vault}/${r.name}` : r.name;
      return `Re-encrypt secret "${label}" for member "${member.memberId}"`;
    },
  );
  await reencryptAllItems(
    signer,
    recipients,
    (kind, id) => `Re-encrypt ${kind} "${id}" for member "${member.memberId}"`,
  );
  await reEncryptChats(signer, recipients);
  return { devicesAdded, devicesSkipped };
}

export async function removeMember(
  memberId: string,
  signer: DeviceIdentity,
): Promise<void> {
  const members = await readMembers();
  const member = members.get(memberId);
  if (member?.role === "owner") {
    throw new Error("The vault owner can't be removed.");
  }
  const devices = await listDevices();
  for (const d of devices) {
    if (d.owner !== memberId) continue;
    const path = devicePath(d.deviceId);
    await ensureSha(path);
    const sha = shaCache.get(path);
    if (!sha) continue;
    await backend.deleteFile(path, sha, `Remove device "${d.name}" of member "${memberId}"`);
    shaCache.delete(path);
  }
  const memPath = memberPath(memberId);
  await ensureSha(memPath);
  const memSha = shaCache.get(memPath);
  if (memSha) {
    await backend.deleteFile(memPath, memSha, `Remove member "${memberId}"`);
    shaCache.delete(memPath);
  }
  const recipients = await collectRecipients(signer);
  await reEncryptAll(
    signer,
    recipients,
    (r) => {
      const label = r.vault ? `${r.vault}/${r.name}` : r.name;
      return `Re-encrypt secret "${label}" after removing member "${memberId}"`;
    },
  );
  await reencryptAllItems(
    signer,
    recipients,
    (kind, id) => `Re-encrypt ${kind} "${id}" after removing member "${memberId}"`,
  );
  await reEncryptChats(signer, recipients);
}
