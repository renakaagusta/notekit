/**
 * Composition root for the per-device age identity module.
 *
 * The ONE place device-key is bound to its platform detector (a driven
 * adapter). Wiring runs eagerly at import — before any identity is created — so
 * behavior is identical to the old direct `getNativePlatform()` call. Consumers
 * that create/load device identities import from here; type-only importers of
 * `DeviceIdentity` may keep importing the module directly.
 */
import { platformPort } from "../adapters/driven/native";
import { configureDeviceKey } from "../lib/crypto/device-key";

configureDeviceKey(platformPort);

export * from "../lib/crypto/device-key";
