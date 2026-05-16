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
