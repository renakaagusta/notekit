import { generateIdentity, identityToRecipient } from "age-encryption";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeviceIdentity } from "./crypto/device-key";
import { generateVaultKey } from "./crypto/keybox";
import {
  generateRecoveryMnemonic,
  recoverySigningFromMnemonic,
  recoveryFromMnemonic,
} from "./crypto/recovery";
import { deviceSigningPayload, sign, toB64 } from "./crypto/signing";
import {
  AUTHORITY_PREFIX,
  DEVICES_PREFIX,
  KEYBOX_PATH,
  addDevice,
  addMember,
  authorityGrantPath,
  collectVaultRecipients,
  configureSecretsBackend,
  configureSecretsCache,
  getSecret,
  initVault,
  loadAuthorityGrant,
  noopSecretsCache,
  setActiveVaultKey,
  setSecret,
  unlockVaultKey,
  type SecretsBackend,
} from "./secrets-vault";

const PHRASE =
  "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title";

/** Minimal in-memory vault so authorization logic is testable without a network. */
function memoryBackend(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  let writes = 0;
  const backend: SecretsBackend = {
    async listFiles(prefix) {
      return {
        entries: [...files.keys()]
          .filter((p) => p.startsWith(prefix))
          .map((p) => ({ path: p, sha: `sha-${p}` })),
      };
    },
    async readFile(path) {
      const content = files.get(path) ?? null;
      return { path, content, sha: content === null ? null : `sha-${path}` };
    },
    async readFileAtRef(path) {
      const content = files.get(path) ?? null;
      return { path, content, sha: content === null ? null : `sha-${path}` };
    },
    async writeFile(path, content) {
      files.set(path, content);
      writes++;
      return { path, sha: `sha-${path}-${writes}` };
    },
    async deleteFile(path) {
      files.delete(path);
      return { ok: true };
    },
  };
  return { backend, files };
}

const device: DeviceIdentity = {
  deviceId: "dev1",
  name: "Test device",
  identity: "AGE-SECRET-KEY-1TEST",
  recipient: "age1testdevicerecipient",
  createdAt: "2026-08-25T00:00:00.000Z",
};

beforeEach(() => configureSecretsCache(noopSecretsCache));

// eslint-disable-next-line max-lines-per-function -- adversarial suite for WhatsApp-style phrase-free approval; grouped setup keeps each scenario self-contained
describe("WhatsApp-style phrase-free device approval (authority grant)", () => {
  afterEach(() => setActiveVaultKey(null));

  async function mkDevice(id: string): Promise<DeviceIdentity> {
    const identity = await generateIdentity();
    const recipient = await identityToRecipient(identity);
    return { deviceId: id, name: id, identity, recipient, createdAt: "2026-08-25T00:00:00.000Z" };
  }

  // A signed-mode envelope vault created by the owner, plus one secret. Returns
  // the owner device + recovery signing key so tests can add/approve devices.
  async function seedEnvelopeVault() {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const recoverySigning = await recoverySigningFromMnemonic(PHRASE);
    const rec = await recoveryFromMnemonic(PHRASE);
    const owner = await mkDevice("owner");
    await initVault({
      device: owner,
      recoveryRecipient: rec.recipient,
      recoverySigning,
      scheme: "envelope",
    });
    setActiveVaultKey(await unlockVaultKey(owner));
    await setSecret("OPENAI", "sk-123", owner);
    return { files, owner, recoverySigning, rec };
  }

  it("(a) an unlocked owner device approves a new device with NO recoverySigning → the new device reads + writes via its grant", async () => {
    const { files, owner, recoverySigning } = await seedEnvelopeVault();

    // Owner (holds the phrase) approves a laptop → laptop gets an authority grant.
    const laptop = await mkDevice("laptop");
    await addDevice(laptop, owner, recoverySigning);
    expect(files.has(authorityGrantPath("laptop"))).toBe(true);

    // The laptop is a keybox recipient, so it reads existing content directly.
    setActiveVaultKey(await unlockVaultKey(laptop));
    expect(await getSecret("OPENAI", laptop)).toBe("sk-123");

    // Phrase-free chain: the laptop loads its grant (no stored mnemonic) and
    // uses it to approve a phone — exactly the WhatsApp companion behavior.
    const laptopSigning = await loadAuthorityGrant(laptop);
    expect(laptopSigning).not.toBeNull();
    const phone = await mkDevice("phone");
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- asserted non-null just above
    await addDevice(phone, laptop, laptopSigning!);

    // The phone joins the recipient set (its device record verifies vs the root)
    // and can open the keybox to read the secret.
    const recips = await collectVaultRecipients(owner);
    expect(recips).toContain(phone.recipient);
    setActiveVaultKey(await unlockVaultKey(phone));
    expect(await getSecret("OPENAI", phone)).toBe("sk-123");

    // And the phone is itself an authority (was granted on approval).
    expect(files.has(authorityGrantPath("phone"))).toBe(true);
    expect(await loadAuthorityGrant(phone)).not.toBeNull();

    // The phone can WRITE new content the owner then reads (full read/write).
    await setSecret("STRIPE", "sk-live", phone);
    setActiveVaultKey(await unlockVaultKey(owner));
    expect(await getSecret("STRIPE", owner)).toBe("sk-live");
  });

  it("(b) FORGERY: a device record signed by an UNTRUSTED key is rejected on read (fails closed)", async () => {
    const { files } = await seedEnvelopeVault();
    const attacker = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const addedAt = "2026-08-25T00:00:00.000Z";
    // Attacker injects a device record signed by their OWN key, not the root.
    files.set(
      `${DEVICES_PREFIX}evil.json`,
      JSON.stringify({
        deviceId: "evil",
        name: "Totally Legit",
        recipient: "age1ATTACKER",
        addedAt,
        sig: sign(deviceSigningPayload({ deviceId: "evil", recipient: "age1ATTACKER", addedAt }), attacker.privateKey),
      }),
    );
    // A reader that isn't the current device must not admit the forged recipient.
    const reader = await mkDevice("reader");
    expect(await collectVaultRecipients(reader)).not.toContain("age1ATTACKER");
  });

  it("(b) FORGERY: a keybox signed by an UNTRUSTED key is rejected on unlock (anti-swap holds)", async () => {
    const { files, owner } = await seedEnvelopeVault();
    const attacker = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const V = await generateVaultKey();
    const { sealKeybox, keyboxSigningPayload } = await import("./crypto/keybox");
    // Attacker re-seals the keybox to the owner + a fresh key they control,
    // signing with their own (untrusted) key.
    const forgedSig = sign(keyboxSigningPayload({ epoch: 1, recipient: V.recipient }), attacker.privateKey);
    const armored = await sealKeybox(V, [owner.recipient], { epoch: 1, sig: forgedSig });
    files.set(KEYBOX_PATH, armored);
    // Owner can decrypt the age layer but the signature check must reject it.
    await expect(unlockVaultKey(owner)).rejects.toThrow(/does not match the vault recovery key/);
  });

  it("(b) FORGERY: an authority grant carrying a NON-root signing key is rejected (grants no authority)", async () => {
    const { files, owner } = await seedEnvelopeVault();
    const attacker = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const { sealAuthorityGrant } = await import("./crypto/keybox");
    // Attacker seals a grant (readable by the owner) but with the WRONG key.
    files.set(
      authorityGrantPath(owner.deviceId),
      await sealAuthorityGrant(attacker, owner.recipient),
    );
    await expect(loadAuthorityGrant(owner)).rejects.toThrow(/does not match the vault recovery key/);
  });

  it("(c) the recovery-phrase path still approves a device (fallback intact)", async () => {
    const { owner, recoverySigning } = await seedEnvelopeVault();
    // A device with NO stored mnemonic and NO grant: the caller supplies the
    // signing key derived from the typed phrase (what the UI does on fallback).
    const secondary = await mkDevice("secondary");
    await addDevice(secondary, owner, recoverySigning);
    setActiveVaultKey(await unlockVaultKey(secondary));
    expect(await getSecret("OPENAI", secondary)).toBe("sk-123");
  });

  it("(d) MIGRATION-SAFE: a signed vault with no authority/ dir still verifies and refuses phrase-free add", async () => {
    // Old vault: signed envelope, but the approving device holds neither the
    // mnemonic nor a grant. loadAuthorityGrant returns null (no throw), and
    // addDevice without a signing key fails fast — no silent weakening.
    await seedEnvelopeVault();
    const bare = await mkDevice("bare"); // never granted, no mnemonic
    expect(await loadAuthorityGrant(bare)).toBeNull();
    const newDev = await mkDevice("new");
    await expect(addDevice(newDev, bare)).rejects.toThrow(/recovery phrase/);
  });

  it("(d) MIGRATION-SAFE: a legacy unsigned vault yields null grant (no authority concept)", async () => {
    const { backend } = memoryBackend();
    configureSecretsBackend(backend);
    await initVault({ device, recoveryRecipient: "age1recovery", encryption: "off" });
    // No signing key on record → loadAuthorityGrant is a no-op returning null.
    expect(await loadAuthorityGrant(device)).toBeNull();
  });

  it("least-privilege: an admitted MEMBER device never receives an authority grant", async () => {
    const { backend, files } = memoryBackend();
    configureSecretsBackend(backend);
    const ownerSigning = await recoverySigningFromMnemonic(PHRASE);
    const rec = await recoveryFromMnemonic(PHRASE);
    const ownerDev = await mkDevice("ownerdev");
    await initVault({
      device: ownerDev,
      recoveryRecipient: rec.recipient,
      recoverySigning: ownerSigning,
      owner: { memberId: "a@x.com", email: "a@x.com" },
      scheme: "envelope",
    });
    setActiveVaultKey(await unlockVaultKey(ownerDev));

    const b = await recoverySigningFromMnemonic(generateRecoveryMnemonic());
    const bDeviceIdentity = await mkDevice("bdev");
    const bRecipient = bDeviceIdentity.recipient;
    const bAddedAt = "2026-08-25T00:00:00.000Z";
    const bDevice = {
      deviceId: "bdev",
      name: "bdev",
      recipient: bRecipient,
      addedAt: bAddedAt,
      owner: "b@x.com",
      sig: sign(deviceSigningPayload({ deviceId: "bdev", recipient: bRecipient, addedAt: bAddedAt, owner: "b@x.com" }), b.privateKey),
    };
    await addMember(
      { memberId: "b@x.com", email: "b@x.com", signingKey: toB64(b.publicKey) },
      [bDevice],
      ownerDev,
      ownerSigning,
    );
    // Member B's device must NOT have been handed the root signing authority.
    expect([...files.keys()].some((p) => p.startsWith(AUTHORITY_PREFIX))).toBe(false);
  });
});
