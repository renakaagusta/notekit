// notekit-cli — terminal client for NoteKit.
//
// Licensed under the MIT License. See LICENSE in the repo root.
// SPDX-License-Identifier: MIT
//
// Entry point: builds the citty command tree and runs it. Every subcommand
// lives in `src/commands/<name>.ts` and is wired up here so this file stays a
// thin index.

import { defineCommand, runMain } from "citty";
import { authCommand } from "./commands/auth.js";
import { noteCommand } from "./commands/note.js";
import { ticketCommand } from "./commands/ticket.js";
import { vaultCommand } from "./commands/vault.js";
import { secretCommand } from "./commands/secret.js";
import { mcpCommand } from "./commands/mcp.js";
import { upgradeCommand } from "./commands/upgrade.js";

const main = defineCommand({
  meta: {
    name: "notekit",
    version: "0.1.0",
    description: "NoteKit CLI — notes, tickets, and vaults in your terminal.",
  },
  subCommands: {
    auth: authCommand,
    note: noteCommand,
    ticket: ticketCommand,
    vault: vaultCommand,
    secret: secretCommand,
    mcp: mcpCommand,
    upgrade: upgradeCommand,
  },
});

runMain(main);
