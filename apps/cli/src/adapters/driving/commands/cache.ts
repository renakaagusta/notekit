// `notekit cache <sub>` — manage the local ciphertext cache. The cache is a
// content-addressed store of encrypted vault files (keyed by git blob sha) so
// repeated scans don't re-download unchanged data. It is disposable: clearing
// it only costs the next scan a re-download. See
// docs/2026-08-27-cli-vault-ciphertext-cache.md.

import { defineCommand } from "citty";
import kleur from "kleur";
import { cacheInfo, clearCiphertextCache, dieWithError } from "../../../composition/index.js";

const clearCmd = defineCommand({
  meta: { name: "clear", description: "Delete the local ciphertext cache." },
  async run() {
    try {
      const removed = await clearCiphertextCache();
      process.stdout.write(`${kleur.yellow("cleared")} ${removed} cached object(s)\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

const infoCmd = defineCommand({
  meta: { name: "info", description: "Show where the cache lives and how big it is." },
  async run() {
    try {
      const { dir, objects, bytes } = await cacheInfo();
      process.stdout.write(`${kleur.dim("path")}    ${dir}\n`);
      process.stdout.write(`${kleur.dim("objects")} ${objects}\n`);
      process.stdout.write(`${kleur.dim("size")}    ${(bytes / 1024).toFixed(1)} KiB\n`);
    } catch (err) {
      dieWithError(err);
    }
  },
});

export const cacheCommand = defineCommand({
  meta: { name: "cache", description: "Manage the local ciphertext cache." },
  subCommands: { clear: clearCmd, info: infoCmd },
});
