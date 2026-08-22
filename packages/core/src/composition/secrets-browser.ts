/**
 * Composition root for the secrets vault on browser surfaces (web / desktop /
 * mobile). The ONE place the secrets modules are bound to their browser driven
 * adapters — the REST vault-api backend and the IndexedDB ciphertext cache.
 *
 * Imported for its side effect at the top of the shared App component, so the
 * wiring runs once, before any secret operation. CLI and MCP are separate
 * composition roots: they inject their own bearer-auth backend (and the no-op
 * cache) at their own entry points, so this module is never loaded there.
 */
import * as vaultApi from "../adapters/driven/vault-api";
import { vaultCacheStoragePort } from "../adapters/driven/vault-cache";
import {
  configureSecretsBackend,
  configureSecretsCache,
} from "../lib/secrets-vault-core";

configureSecretsBackend({
  listFiles: vaultApi.listFiles,
  readFile: vaultApi.readFile,
  readFileAtRef: vaultApi.readFileAtRef,
  writeFile: vaultApi.writeFile,
  deleteFile: vaultApi.deleteFile,
  commitFiles: vaultApi.commitFiles,
});
configureSecretsCache(vaultCacheStoragePort);
