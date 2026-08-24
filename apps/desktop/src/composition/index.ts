// SPDX-License-Identifier: MIT
// Desktop composition root barrel. This is the ONLY place the driving adapters
// (the preload bridge and the ipcMain handler registration) reach the driven
// adapters (OS keychain, external-browser shell, loopback OAuth server, auto
// updater, page capture, runtime config) and the pure domain helpers they
// consume (IPC contract, keychain-key policy). The driving layer imports from
// here instead of from adapters/driven directly, so it never couples to a
// driven adapter — parity with apps/cli, apps/mcp, and apps/api going through
// composition.

export {
  keychainEntry,
  keychainGet,
  keychainSet,
  keychainDelete,
} from "../adapters/driven/keychain";
export { openExternalUrl } from "../adapters/driven/shell";
export {
  DEV_URL,
  SIGN_IN_TIMEOUT_MS,
  isDevBuild,
  resolveApiUrl,
  resolveProdIndex,
} from "../adapters/driven/config";
export { runLoopbackSignIn } from "../adapters/driven/auth-loopback";
export { checkForUpdates } from "../adapters/driven/updater";
export { capturePageDataUrl } from "../adapters/driven/capture";

export { isAllowedKeychainKey } from "../domain/keychain-key";
export {
  IPC_CHANNELS,
  type AppCapturePagePayload,
  type AppOpenExternalPayload,
  type AuthStartSignInPayload,
  type AuthStartSignInResult,
  type KeychainDeletePayload,
  type KeychainGetPayload,
  type KeychainSetPayload,
  type UpdaterCheckResult,
} from "../domain/ipc-contract";
