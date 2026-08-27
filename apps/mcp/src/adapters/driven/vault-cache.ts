// Disk-backed content-addressed cache of vault ciphertext, so repeated scans
// don't re-download unchanged files. Objects are keyed by git blob sha — a
// content hash — so an entry can never be stale. See
// docs/2026-08-27-cli-vault-ciphertext-cache.md.
//
// This is a deliberate copy of apps/cli/src/adapters/driven/vault-cache.ts: the
// CLI and MCP are independent driving surfaces with their own composition roots,
// so they don't share code (they'd otherwise couple). The on-disk store is the
// same path, and since objects are content-addressed the two processes share
// cache entries for free. Only ciphertext (the already-encrypted .age payload)
// is written — never plaintext.

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { VaultCiphertextCache } from "@notekit/core/vault-e2ee";

/** Git blob shas are lowercase hex (sha1 = 40, sha256 = 64). Guards the filename. */
const BLOB_SHA = /^[0-9a-f]{6,64}$/;

function objectsDir(): string {
  const xdg = process.env["XDG_CACHE_HOME"];
  const base = xdg && xdg.length > 0 ? xdg : path.join(homedir(), ".cache");
  return path.join(base, "notekit", "objects");
}

/**
 * A best-effort disk cache: any I/O failure degrades to a cache miss (refetch
 * from the network, the source of truth), never an error. Disabled entirely
 * when `NOTEKIT_NO_CACHE` is set.
 */
export function diskCiphertextCache(): VaultCiphertextCache | undefined {
  if (process.env["NOTEKIT_NO_CACHE"]) return undefined;
  const dir = objectsDir();
  return {
    async get(sha) {
      if (!BLOB_SHA.test(sha)) return undefined;
      try {
        return await fs.readFile(path.join(dir, sha), "utf8");
      } catch {
        return undefined;
      }
    },
    async put(sha, ciphertext) {
      if (!BLOB_SHA.test(sha)) return;
      const dest = path.join(dir, sha);
      const tmp = `${dest}.${process.pid}.tmp`;
      try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(tmp, ciphertext, { mode: 0o600 });
        await fs.rename(tmp, dest);
      } catch {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
      }
    },
  };
}
