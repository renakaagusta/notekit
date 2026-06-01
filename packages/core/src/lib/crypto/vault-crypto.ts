/**
 * Encrypt/decrypt the secrets blob with age, armor it for text-safe storage
 * in GitHub. Recipients = every active device pubkey + the recovery pubkey,
 * so any device (or the BIP39 mnemonic) can decrypt.
 */
import { Encrypter, Decrypter, armor } from "age-encryption";

export async function encryptSecrets(
  plaintext: string,
  recipients: string[],
): Promise<string> {
  if (recipients.length === 0) {
    throw new Error("encryptSecrets requires at least one recipient");
  }
  const enc = new Encrypter();
  for (const r of recipients) enc.addRecipient(r);
  const raw = await enc.encrypt(plaintext);
  return armor.encode(raw);
}

export async function decryptSecrets(
  armored: string,
  identity: string,
): Promise<string> {
  const dec = new Decrypter();
  dec.addIdentity(identity);
  const raw = armor.decode(armored);
  return dec.decrypt(raw, "text");
}

/**
 * Encrypt to a passphrase (age scrypt) rather than recipient keys — for
 * sharing with someone who has no NoteKit account/keys. They decrypt with the
 * passphrase using any age client (sent out-of-band), so the server still
 * can't read it. See docs/architecture/e2ee-everywhere-and-sharing.md §3.4.
 */
export async function encryptToPassphrase(
  plaintext: string,
  passphrase: string,
): Promise<string> {
  const enc = new Encrypter();
  enc.setPassphrase(passphrase);
  return armor.encode(await enc.encrypt(plaintext));
}

export async function decryptWithPassphrase(
  armored: string,
  passphrase: string,
): Promise<string> {
  const dec = new Decrypter();
  dec.addPassphrase(passphrase);
  return dec.decrypt(armor.decode(armored), "text");
}

/**
 * A high-entropy, human-transcribable passphrase for a share link: 6 BIP39
 * words (~66 bits). Words read aloud / copy cleanly across apps.
 */
export function generateSharePassphrase(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SHARE_WORDS[b % SHARE_WORDS.length]).join("-");
}

// A small, unambiguous word list (no homophones/profanity) for share links.
const SHARE_WORDS = [
  "amber", "basil", "cedar", "delta", "ember", "flint", "grove", "hazel",
  "ivory", "jade", "koala", "lotus", "maple", "nimbus", "olive", "pearl",
  "quartz", "raven", "sage", "tonic", "umber", "vivid", "willow", "xenon",
  "yarrow", "zephyr", "cobalt", "dune", "fern", "glint", "harbor", "indigo",
] as const;
