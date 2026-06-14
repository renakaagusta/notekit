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
