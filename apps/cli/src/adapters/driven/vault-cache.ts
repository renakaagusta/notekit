// Disk-backed content-addressed cache of vault ciphertext, so repeated scans
// don't re-download unchanged files. Objects are keyed by git blob sha — a
// content hash — so an entry can never be stale: a changed file has a new sha
// that keys a different (missing) object. See
// docs/2026-08-27-cli-vault-ciphertext-cache.md.
//
// One shared store per machine is correct: the blob sha identifies the exact
// ciphertext bytes globally, so two vaults never collide. Only ciphertext (the
// already-encrypted .age payload) is written — never plaintext.

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { VaultCiphertextCache } from "@notekit/core/vault-e2ee";

/** Git blob shas are lowercase hex (sha1 = 40, sha256 = 64). Guards the filename. */
const BLOB_SHA = /^[0-9a-f]{6,64}$/;

/** The content-addressed object store directory (`$XDG_CACHE_HOME/notekit/objects`). */
function objectsDir(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(homedir(), ".cache");
  return path.join(base, "notekit", "objects");
}

/**
 * A best-effort disk cache: any I/O failure degrades to a cache miss (refetch
 * from the network, which is the source of truth), never an error. Disabled
 * entirely when `NOTEKIT_NO_CACHE` is set, for debugging.
 */
export function diskCiphertextCache(): VaultCiphertextCache | undefined {
  if (process.env.NOTEKIT_NO_CACHE) return undefined;
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
        // Write-then-rename so a concurrent reader never sees a partial file.
        await fs.writeFile(tmp, ciphertext, { mode: 0o600 });
        await fs.rename(tmp, dest);
      } catch {
        await fs.rm(tmp, { force: true }).catch(() => undefined);
      }
    },
  };
}

/** Delete the whole object store. Returns how many objects were removed. */
export async function clearCiphertextCache(): Promise<number> {
  const dir = objectsDir();
  const { objects } = await cacheInfo();
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Nothing cached yet — treat as zero removed.
  }
  return objects;
}

export interface CacheInfo {
  dir: string;
  objects: number;
  bytes: number;
}

/** Where the cache lives and how much it holds. */
export async function cacheInfo(): Promise<CacheInfo> {
  const dir = objectsDir();
  let objects = 0;
  let bytes = 0;
  try {
    for (const name of await fs.readdir(dir)) {
      if (!BLOB_SHA.test(name)) continue;
      const stat = await fs.stat(path.join(dir, name));
      if (stat.isFile()) {
        objects++;
        bytes += stat.size;
      }
    }
  } catch {
    // No cache dir yet — report zero.
  }
  return { dir, objects, bytes };
}
