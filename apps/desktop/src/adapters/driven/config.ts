// SPDX-License-Identifier: MIT
// Driven adapter: resolve desktop runtime configuration from the process
// environment and Electron's packaged-resources layout. These are outside
// I/O the app reads at startup — env knobs, packaging paths, dev detection.

import path from "node:path";
import { app } from "electron";

export const DEV_URL = "http://localhost:5173";

/** Sign-in loopback waits this long for the browser callback before giving up. */
export const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

export function isDevBuild(): boolean {
  return process.env.NOTEKIT_DEV === "1" || !app.isPackaged;
}

/**
 * Base URL of the NoteKit API. The same env knob the web build reads
 * (`VITE_API_URL`) is honored here so a dev pointing at a staging API
 * gets the same target in main and renderer.
 */
export function resolveApiUrl(): string {
  const fromEnv = process.env.NOTEKIT_API_URL ?? process.env.VITE_API_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/$/, "");
  return "https://api.notekit.online";
}

// In production the web build is shipped via electron-builder's
// `extraResources` entry, which copies apps/web/dist into the packaged app
// at `<resourcesPath>/app/web` (see electron-builder.yml).
export function resolveProdIndex(): string {
  return path.join(process.resourcesPath, "app", "web", "index.html");
}
