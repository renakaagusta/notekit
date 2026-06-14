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
