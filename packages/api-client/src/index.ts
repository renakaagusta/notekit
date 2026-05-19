// @notekit/api-client — single entry every NoteKit surface uses to talk to
// the API. Web app passes `auth: { mode: "cookie" }`; CLI/desktop/MCP pass
// `auth: { mode: "bearer", getToken }`.
//
// Usage:
//   import { createNoteKitClient } from "@notekit/api-client";
//   const nk = createNoteKitClient({ baseUrl, auth: { mode: "cookie" } });
//   const me = await nk.auth.me();
//   const vaults = await nk.vault.list();

import { NoteKitClient, type NoteKitClientOptions } from "./transport";
import { authEndpoints } from "./endpoints/auth";
import { vaultEndpoints } from "./endpoints/vault";
import { agentEndpoints } from "./endpoints/agents";
import { notificationEndpoints } from "./endpoints/notifications";
import { iapEndpoints } from "./endpoints/iap";

export type { NoteKitClientOptions } from "./transport";
export { NoteKitClient } from "./transport";
export { NoteKitApiError, NoteKitAuthError, NoteKitNetworkError } from "./errors";
export type * from "./types";

export interface NoteKitApi {
  client: NoteKitClient;
  auth: ReturnType<typeof authEndpoints>;
  vault: ReturnType<typeof vaultEndpoints>;
  agents: ReturnType<typeof agentEndpoints>;
  notifications: ReturnType<typeof notificationEndpoints>;
  iap: ReturnType<typeof iapEndpoints>;
}

export function createNoteKitClient(opts: NoteKitClientOptions): NoteKitApi {
  const client = new NoteKitClient(opts);
  return {
    client,
    auth: authEndpoints(client),
    vault: vaultEndpoints(client),
    agents: agentEndpoints(client),
    notifications: notificationEndpoints(client),
    iap: iapEndpoints(client),
  };
}
