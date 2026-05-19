// Builds a NoteKitApi instance using the local config + OS keychain. Every
// command that needs the API calls `getClient()` — never construct one inline.

import { createNoteKitClient, type NoteKitApi } from "@notekit/api-client";
import { loadConfig } from "./config.js";
import { getToken } from "./keychain.js";
import kleur from "kleur";

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not signed in. Run `notekit auth login` first.");
    this.name = "NotAuthenticatedError";
  }
}

export interface GetClientOptions {
  /** If true, throw NotAuthenticatedError when no token is in the keychain. */
  requireAuth?: boolean;
}

export async function getClient(opts: GetClientOptions = {}): Promise<NoteKitApi> {
  const cfg = await loadConfig();
  const token = await getToken();

  if (opts.requireAuth && !token) {
    throw new NotAuthenticatedError();
  }

  return createNoteKitClient({
    baseUrl: cfg.apiUrl,
    auth: {
      mode: "bearer",
      getToken: async () => token,
    },
  });
}

/** Pretty-print an unknown error and exit with code 1. Used in command catch blocks. */
export function dieWithError(err: unknown): never {
  if (err instanceof NotAuthenticatedError) {
    process.stderr.write(kleur.red(err.message) + "\n");
  } else if (err instanceof Error) {
    process.stderr.write(kleur.red(`error: ${err.message}`) + "\n");
  } else {
    process.stderr.write(kleur.red(`error: ${String(err)}`) + "\n");
  }
  process.exit(1);
}
