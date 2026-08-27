/**
 * Node-safe crypto barrel for non-browser consumers (CLI, MCP).
 *
 * Re-exports only the platform-agnostic crypto — identity derivation, item
 * encrypt/decrypt, and signing — which depend solely on `age-encryption`,
 * `@noble`, and `@scure`. It deliberately omits the browser-only storage
 * modules (`device-key`, `recovery-store`, `trust-store`, which use
 * IndexedDB); Node consumers provide their own storage. See #49.
 */
export * from "./recovery";
export * from "./item-crypto";
export * from "./signing";
export * from "./wallet-key";
// Pure safety-number derivation (no storage) — out-of-band device verification
// on Node surfaces (CLI approve).
export { deriveFingerprint, formatFingerprint } from "./fingerprint";
// Type-only — no runtime import of the IndexedDB-backed device-key module.
export type { DeviceIdentity } from "./device-key";
// Pure age keypair generation (no IDB storage) — safe for Node consumers.
export { generateIdentity, identityToRecipient } from "age-encryption";
