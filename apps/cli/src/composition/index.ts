// CLI composition root barrel. This is the ONLY place the driving adapters
// (commands) reach the driven adapters (transport client, OS keychain, config
// file, editor, MCP-client config writers) and the composition glue that wires
// @notekit/core to those adapters (crypto, secrets). Commands import from here
// instead of from adapters/driven directly, so the driving layer never couples
// to a driven adapter — parity with apps/api routes going through composition.

export { getClient, dieWithError } from "../adapters/driven/client.js";
export { loadConfig, patchConfig } from "../adapters/driven/config.js";
export {
  getToken,
  setToken,
  clearToken,
  getRecoveryPhrase,
  setRecoveryPhrase,
  clearRecoveryPhrase,
  getDeviceIdentity,
  setDeviceIdentity,
} from "../adapters/driven/keychain.js";
export { openEditor } from "../adapters/driven/editor.js";
export {
  ALL_CLIENTS,
  buildEntry,
  getClient as getClientAdapter,
  resolveNotekitBinary,
  type ClientId,
} from "../adapters/driven/mcp-clients.js";

export {
  requireVaultIdentity,
  vaultDevice,
  isEncrypted,
  vaultIsEncrypted,
  decryptNote,
  decryptTicket,
  encryptNote,
  encryptTicket,
  listEncryptedNotes,
  listEncryptedTickets,
} from "./crypto.js";
export { getSecretsClient } from "./secrets.js";
