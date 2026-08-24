// SPDX-License-Identifier: MIT
// Pure keychain-key policy for the desktop wrapper. No external libraries and
// no Electron imports — just the shape regex and allowlist that decide which
// OS-credential keys the renderer is permitted to touch.

// Names the renderer is allowed to read or write in the OS keychain. Locking
// this down means a compromised renderer (XSS in the web bundle, a malicious
// third-party script, a will-navigate slip) can only touch credentials we
// already trust it with — not e.g. an SSH key the user later stores under
// the same service id.
export const ALLOWED_KEYCHAIN_KEYS = new Set<string>([
  // Bearer token persisted across sessions when the user signs in via the
  // CLI loopback flow inside Electron. Matches the CLI's keychain account.
  "token",
  // Per-vault GitHub PAT for users with a BYO GitHub vault.
  "github.token",
]);

export const KEYCHAIN_KEY_RE = /^[a-z][a-z0-9._-]{0,63}$/;

/**
 * Validate a keychain key from the renderer against both a shape regex and
 * a hardcoded allowlist. Returning false here means a compromised renderer
 * cannot read or overwrite arbitrary OS credentials under our service id —
 * the worst it can do is touch the small set of keys we already expose to
 * the SPA.
 */
export function isAllowedKeychainKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    KEYCHAIN_KEY_RE.test(key) &&
    ALLOWED_KEYCHAIN_KEYS.has(key)
  );
}
