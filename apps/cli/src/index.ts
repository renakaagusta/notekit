// notekit-cli — terminal client for NoteKit.
//
// Licensed under the MIT License. See LICENSE in the repo root.
// SPDX-License-Identifier: MIT
//
// Entry point: builds the citty command tree and runs it. Every subcommand
// lives in `src/commands/<name>.ts` and is wired up here so this file stays a
// thin index.

import { defineCommand, runMain } from "citty";
import { authCommand } from "./adapters/driving/commands/auth.js";
import { cacheCommand } from "./adapters/driving/commands/cache.js";
import { devicesCommand } from "./adapters/driving/commands/devices.js";
import { linkCommand } from "./adapters/driving/commands/link.js";
import { mcpCommand } from "./adapters/driving/commands/mcp.js";
import { noteCommand } from "./adapters/driving/commands/note.js";
import { secretCommand } from "./adapters/driving/commands/secret.js";
import { ticketCommand } from "./adapters/driving/commands/ticket.js";
import { upgradeCommand } from "./adapters/driving/commands/upgrade.js";
import { vaultCommand } from "./adapters/driving/commands/vault.js";

const main = defineCommand({
  meta: {
    name: "notekit",
    version: "0.4.0",
    description: "NoteKit CLI — notes, tasks, and vaults in your terminal.",
  },
  subCommands: {
    auth: authCommand,
    note: noteCommand,
    task: ticketCommand,
    ticket: ticketCommand, // backward-compatible alias
    link: linkCommand,
    vault: vaultCommand,
    devices: devicesCommand,
    secret: secretCommand,
    mcp: mcpCommand,
    cache: cacheCommand,
    upgrade: upgradeCommand,
  },
});

runMain(main);
