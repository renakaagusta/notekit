// Bridges the CLI's bearer-auth NoteKit client into the secrets module from
// @notekit/core, which otherwise defaults to the browser cookie-auth backend.
// Every command that touches secrets calls `getSecretsClient()` so the
// configuration step happens exactly once per process.

import { configureSecretsBackend, secretsBackendFromApi } from "@notekit/core/secrets";
import type { NoteKitApi } from "@notekit/api-client";
import { getClient, type GetClientOptions } from "../client.js";

let configured = false;

export async function getSecretsClient(opts: GetClientOptions = {}): Promise<NoteKitApi> {
  const nk = await getClient(opts);
  if (!configured) {
    configureSecretsBackend(secretsBackendFromApi(nk));
    configured = true;
  }
  return nk;
}
