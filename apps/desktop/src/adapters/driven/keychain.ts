// SPDX-License-Identifier: MIT
// Driven adapter: OS keychain access via @napi-rs/keyring (macOS Keychain,
// Windows Credential Manager, libsecret/kwallet on Linux). The main process
// drives this to persist and read the bearer token / vault PAT.

import { Entry } from "@napi-rs/keyring";
import { KEYCHAIN_SERVICE } from "../../domain/ipc-contract";

// One Entry per (service, account) tuple. We construct on demand because
// Entry instances are cheap and @napi-rs/keyring's underlying OS calls do
// the actual locking — caching here would add a Map for no measurable win.
export function keychainEntry(key: string): Entry {
  return new Entry(KEYCHAIN_SERVICE, key);
}

export function keychainGet(key: string): string | null {
  try {
    return keychainEntry(key).getPassword() ?? null;
  } catch {
    // No entry yet, or the OS keyring is locked — treat as "absent" so
    // the renderer can fall back to its sign-in flow.
    return null;
  }
}

export function keychainSet(key: string, value: string): void {
  keychainEntry(key).setPassword(value);
}

export function keychainDelete(key: string): boolean {
  try {
    keychainEntry(key).deletePassword();
    return true;
  } catch {
    // Entry didn't exist — preserve keytar's "returns false" semantic.
    return false;
  }
}
