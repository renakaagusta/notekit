// SPDX-License-Identifier: MIT
// Driven adapter: hand a URL to the OS default browser. The renderer never
// navigates external origins in-window; the wrapper drives the shell instead.

import { shell } from "electron";

export function openExternalUrl(url: string): Promise<void> {
  return shell.openExternal(url);
}
