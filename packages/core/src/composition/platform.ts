/**
 * Composition root exposing the wired platform detector to driving adapters,
 * so components depend on the PlatformPort capability rather than importing the
 * Capacitor-reading driven adapter directly.
 */
import { platformPort } from "../adapters/driven/native";

export const platform = platformPort;
