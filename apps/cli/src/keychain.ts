// Thin wrapper over @napi-rs/keyring. We store one secret per user account
// under the service "notekit-cli". The "account" name is fixed to "token" for
// now — if we ever support multi-account, switch on email/userId.
//
// On macOS this backs onto Keychain Access; on Linux libsecret/kwallet; on
// Windows the Credential Manager. No native compile needed (prebuilds ship).

import { Entry } from "@napi-rs/keyring";

const SERVICE = "notekit-cli";
const ACCOUNT = "token";
// The vault recovery phrase (24-word BIP39), stored after `notekit vault
// unlock`. It derives the age identity that decrypts E2EE notes/secrets (#49).
const RECOVERY_ACCOUNT = "recovery";

function entry(): Entry {
  return new Entry(SERVICE, ACCOUNT);
}

function recoveryEntry(): Entry {
  return new Entry(SERVICE, RECOVERY_ACCOUNT);
}

export async function getRecoveryPhrase(): Promise<string | null> {
  // Env wins — headless servers / CI have no OS keyring. Matches the MCP's
  // NOTEKIT_RECOVERY_PHRASE so a server can unlock the vault without `unlock`.
  const env = process.env.NOTEKIT_RECOVERY_PHRASE?.trim();
  if (env) return env;
  try {
    return recoveryEntry().getPassword() ?? null;
  } catch {
    return null;
  }
}

export async function setRecoveryPhrase(phrase: string): Promise<void> {
  recoveryEntry().setPassword(phrase);
}

export async function clearRecoveryPhrase(): Promise<void> {
  try {
    recoveryEntry().deletePassword();
  } catch {
    // Already absent — ignore.
  }
}

export async function getToken(): Promise<string | null> {
  // Env wins — headless servers / CI have no OS keyring, so `auth login`
  // can't persist a token there. Set NOTEKIT_TOKEN (a `nkp_` user token or
  // an `nka_` agent token) and the CLI is authenticated without a keyring.
  const env = process.env.NOTEKIT_TOKEN?.trim();
  if (env) return env;
  try {
    const value = entry().getPassword();
    return value ?? null;
  } catch {
    // No entry yet, or the OS keyring is locked. Treat as "not logged in".
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  entry().setPassword(token);
}

export async function clearToken(): Promise<void> {
  try {
    entry().deletePassword();
  } catch {
    // Already absent — ignore.
  }
}
