/**
 * Pairing fingerprint — a short, human-comparable code derived from a device's
 * *full* public key.
 *
 * Device pairing is server-mediated: the new device's public key is relayed
 * through the NoteKit API, so a compromised server could substitute its own
 * key and have the existing device re-encrypt the vault to it. Showing only a
 * truncated pubkey on the approving side doesn't let the human catch that.
 *
 * The fix is the Signal/WhatsApp "safety number" pattern: derive the same
 * fingerprint from the full key on BOTH devices and have the user eyeball-match
 * them. Because it's a hash of the whole key, the server can't swap the key
 * without the two fingerprints diverging.
 *
 * Output is three emoji + word pairs, e.g. "🦊 fox · 🌲 pine · 🔑 key", which
 * is far easier to compare across two screens than hex. The point is human
 * MITM detection during a 5-minute pairing window, not cryptographic binding.
 */

// Exactly 32 symbols → 5 usable bits per slot. Emoji + word so it reads aloud
// cleanly and survives font differences across platforms.
const ALPHABET: ReadonlyArray<{ emoji: string; word: string }> = [
  { emoji: "🦊", word: "fox" },
  { emoji: "🐙", word: "octopus" },
  { emoji: "🌲", word: "pine" },
  { emoji: "🔑", word: "key" },
  { emoji: "🍋", word: "lemon" },
  { emoji: "🚀", word: "rocket" },
  { emoji: "🐝", word: "bee" },
  { emoji: "🎲", word: "dice" },
  { emoji: "🌙", word: "moon" },
  { emoji: "🍄", word: "mushroom" },
  { emoji: "⚓", word: "anchor" },
  { emoji: "🦋", word: "butterfly" },
  { emoji: "🌵", word: "cactus" },
  { emoji: "🍒", word: "cherry" },
  { emoji: "🐢", word: "turtle" },
  { emoji: "🔥", word: "fire" },
  { emoji: "🎈", word: "balloon" },
  { emoji: "🧊", word: "ice" },
  { emoji: "🌽", word: "corn" },
  { emoji: "🌴", word: "palm" },
  { emoji: "🐳", word: "whale" },
  { emoji: "🍇", word: "grapes" },
  { emoji: "🌻", word: "sunflower" },
  { emoji: "🪁", word: "kite" },
  { emoji: "🦉", word: "owl" },
  { emoji: "🌶️", word: "pepper" },
  { emoji: "🍩", word: "donut" },
  { emoji: "🧭", word: "compass" },
  { emoji: "🐬", word: "dolphin" },
  { emoji: "🎸", word: "guitar" },
  { emoji: "🌈", word: "rainbow" },
  { emoji: "🦔", word: "hedgehog" },
];

export interface FingerprintSlot {
  emoji: string;
  word: string;
}

const SLOTS = 3;

/**
 * Derive the comparable fingerprint slots from a full age recipient string.
 * Deterministic: the same pubkey always yields the same slots on every device.
 */
export async function deriveFingerprint(pubkey: string): Promise<FingerprintSlot[]> {
  const bytes = new TextEncoder().encode(pubkey.trim());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const slots: FingerprintSlot[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const idx = digest[i]! % ALPHABET.length;
    slots.push(ALPHABET[idx]!);
  }
  return slots;
}

/** Render slots as a compact emoji+word string, e.g. "🦊 fox · 🌲 pine · 🔑 key". */
export function formatFingerprint(slots: FingerprintSlot[]): string {
  return slots.map((s) => `${s.emoji} ${s.word}`).join(" · ");
}
