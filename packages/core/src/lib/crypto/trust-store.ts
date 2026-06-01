/**
 * Client-side trust pin (TOFU) for a vault's recovery signing key.
 *
 * Signed-mode enforcement in `secrets-vault` keys off `recovery.json` carrying
 * a `signingKey`. That alone is downgradeable: an attacker with write access
 * could *strip* the signing key to drop the vault back to legacy/unsigned mode
 * and then slip in an injected recipient. To stop that, once a client has seen
 * a vault in signed mode it **pins** the signing key here and refuses to fall
 * back — and warns if the pinned key ever changes (a key-substitution signal,
 * like WhatsApp's "security code changed").
 *
 * Stored in localStorage (available in web / Electron / Capacitor WebView, the
 * clients that face the attack). In Node-only contexts (CLI/MCP, a trusted
 * operator) there's no localStorage and pinning is simply skipped.
 */
const PREFIX = "notekit:trust:signingKey:";

function ls(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** The signing key this client has pinned for `vaultId`, or null if none. */
export function getPinnedSigningKey(vaultId: string): string | null {
  return ls()?.getItem(PREFIX + vaultId) ?? null;
}

/** Pin the signing key on first sight of signed mode (TOFU). */
export function pinSigningKey(vaultId: string, signingKey: string): void {
  ls()?.setItem(PREFIX + vaultId, signingKey);
}

/** Drop the pin (e.g. on an intentional crypto reset for this vault). */
export function clearPinnedSigningKey(vaultId: string): void {
  ls()?.removeItem(PREFIX + vaultId);
}

export class TrustDowngradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustDowngradeError";
  }
}

/**
 * Verify a vault's recovery signing state against this client's pin and,
 * when available, the signing key derived from the local recovery mnemonic.
 * Pins on first sight; throws {@link TrustDowngradeError} on a downgrade
 * (signing key removed after we'd seen it) or substitution (key changed, or it
 * doesn't match the user's own recovery phrase). Legacy never-signed vaults
 * (no pin, no signing key) pass untouched.
 *
 * @param currentSigningKey  the `signingKey` from `recovery.json`, or null
 * @param expectedFromMnemonic  the signing key derived from this device's
 *   stored recovery mnemonic, if it holds one — the strongest check
 */
export function verifySigningKeyTrust(
  vaultId: string,
  currentSigningKey: string | null,
  expectedFromMnemonic?: string | null,
): void {
  const pinned = getPinnedSigningKey(vaultId);

  if (currentSigningKey) {
    if (expectedFromMnemonic && currentSigningKey !== expectedFromMnemonic) {
      throw new TrustDowngradeError(
        "The vault's signing key doesn't match your recovery phrase — it may have been tampered with.",
      );
    }
    if (pinned && pinned !== currentSigningKey) {
      throw new TrustDowngradeError(
        "The vault's signing key changed since you last used it — possible key substitution. Verify the device list before continuing.",
      );
    }
    if (!pinned) pinSigningKey(vaultId, currentSigningKey);
    return;
  }

  // No signing key in recovery.json: legacy *unless* we've seen it signed.
  if (pinned) {
    throw new TrustDowngradeError(
      "This vault was end-to-end-signed before but its signing key is now missing — refusing to fall back to unsigned mode (possible downgrade attack).",
    );
  }
}
