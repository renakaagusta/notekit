/**
 * The runtime a NoteKit client is executing in. A pure domain value: the three
 * shells we ship (plain web, Capacitor native, Electron desktop) collapse to
 * these three platform tags. Detecting the current one is a driven concern
 * (reads Capacitor / the DOM); this type is just the vocabulary.
 */
export type NativePlatform = "web" | "ios" | "android";
