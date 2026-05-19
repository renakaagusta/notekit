// Thin wrapper over @napi-rs/keyring. We store one secret per user account
// under the service "notekit-cli". The "account" name is fixed to "token" for
// now — if we ever support multi-account, switch on email/userId.
//
// On macOS this backs onto Keychain Access; on Linux libsecret/kwallet; on
// Windows the Credential Manager. No native compile needed (prebuilds ship).

import { Entry } from "@napi-rs/keyring";

const SERVICE = "notekit-cli";
const ACCOUNT = "token";

function entry(): Entry {
  return new Entry(SERVICE, ACCOUNT);
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
