// Bridges the CLI's bearer-auth NoteKit client into the secrets module from
// @notekit/core. The secrets module has no built-in backend/cache, so this is
// the CLI composition root that injects both. Every command that touches
// secrets calls `getSecretsClient()` so the wiring happens once per process.

import type { NoteKitApi } from "@notekit/api-client";
import {
  configureSecretsBackend,
  configureSecretsCache,
  noopSecretsCache,
  secretsBackendFromApi,
} from "@notekit/core/secrets";
import { getClient, type GetClientOptions } from "../adapters/driven/client.js";

let configured = false;

export async function getSecretsClient(opts: GetClientOptions = {}): Promise<NoteKitApi> {
  const nk = await getClient(opts);
  if (!configured) {
    configureSecretsBackend(secretsBackendFromApi(nk));
    configureSecretsCache(noopSecretsCache);
    configured = true;
  }
  return nk;
}
