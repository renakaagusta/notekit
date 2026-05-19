// Persistent CLI config. Lives at $XDG_CONFIG_HOME/notekit/config.json (or
// ~/.config/notekit/config.json). Holds non-secret data only — the auth token
// belongs in the OS keychain, see keychain.ts.

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface CliConfig {
  apiUrl: string;
  currentVaultId?: string;
  userId?: string;
  email?: string;
}

const DEFAULT_CONFIG: CliConfig = {
  apiUrl: "http://localhost:3001",
};

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(homedir(), ".config");
  return path.join(base, "notekit");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export async function loadConfig(): Promise<CliConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...DEFAULT_CONFIG };
    }
    throw err;
  }
}

export async function saveConfig(cfg: CliConfig): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true });
  // 0600 — config can hold the email + vault id, treat it as sensitive.
  await fs.writeFile(configPath(), JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

export async function patchConfig(patch: Partial<CliConfig>): Promise<CliConfig> {
  const current = await loadConfig();
  const next = { ...current, ...patch };
  await saveConfig(next);
  return next;
}
