import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { nanoid } from "nanoid";
import { env } from "../env";
import * as schema from "./schema";

function resolveSqlitePath(url: string): string {
  if (url.startsWith("file:")) return url.slice("file:".length);
  return url;
}

const dbPath = resolveSqlitePath(env.databaseUrl);
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Bootstrap schema. Idempotent on every start.
//
// This raw SQL is the single source of truth for the DB shape. `schema.ts`
// mirrors it for Drizzle's query builder; if you change one, change both
// (and add an explicit migration for the existing column when needed —
// `CREATE TABLE IF NOT EXISTS` never alters an existing table).
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    avatar_url TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS oauth_accounts (
    provider TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (provider, provider_account_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    vault_provider TEXT,
    vault_owner TEXT,
    vault_repo TEXT,
    vault_branch TEXT DEFAULT 'main',
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_slug TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_agent_tokens_hash ON agent_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_agent_tokens_user_slug ON agent_tokens(user_id, agent_slug);

  CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    label TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_vaults_user_id ON vaults(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_vaults_user_provider_owner_repo
    ON vaults(user_id, provider, owner, repo);

  CREATE TABLE IF NOT EXISTS vault_settings (
    vault_id TEXT PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'auto',
    default_folder TEXT,
    default_agent_slug TEXT,
    updated_at INTEGER NOT NULL
  );
`);

// One-time inline migrations. SQLite cannot ALTER ADD COLUMN unless absent;
// PRAGMA table_info reveals current shape so we no-op when already migrated.
function columnExists(table: string, column: string): boolean {
  const rows = sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

if (!columnExists("user_settings", "active_vault_id")) {
  sqlite.exec(
    `ALTER TABLE user_settings ADD COLUMN active_vault_id TEXT REFERENCES vaults(id) ON DELETE SET NULL`,
  );
}

// Backfill: for any user_settings row with a legacy single vault but no
// active_vault_id, create a vaults row and point active_vault_id at it.
const legacyRows = sqlite
  .prepare(
    `SELECT user_id, vault_provider, vault_owner, vault_repo, vault_branch
       FROM user_settings
      WHERE active_vault_id IS NULL
        AND vault_owner IS NOT NULL
        AND vault_repo IS NOT NULL`,
  )
  .all() as Array<{
  user_id: string;
  vault_provider: string | null;
  vault_owner: string;
  vault_repo: string;
  vault_branch: string | null;
}>;

if (legacyRows.length > 0) {
  const insertVault = sqlite.prepare(
    `INSERT INTO vaults (id, user_id, provider, owner, repo, branch, label, created_at)
     VALUES (@id, @user_id, @provider, @owner, @repo, @branch, @label, @created_at)`,
  );
  const updateSettings = sqlite.prepare(
    `UPDATE user_settings SET active_vault_id = @vault_id WHERE user_id = @user_id`,
  );
  const tx = sqlite.transaction(
    (rows: typeof legacyRows) => {
      for (const r of rows) {
        const id = `vlt_${nanoid(16)}`;
        insertVault.run({
          id,
          user_id: r.user_id,
          provider: (r.vault_provider ?? "github") as string,
          owner: r.vault_owner,
          repo: r.vault_repo,
          branch: r.vault_branch ?? "main",
          label: `${r.vault_owner}/${r.vault_repo}`,
          created_at: Date.now(),
        });
        updateSettings.run({ vault_id: id, user_id: r.user_id });
      }
    },
  );
  tx(legacyRows);
  console.log(`[db] migrated ${legacyRows.length} legacy vault(s) into vaults table`);
}

export const db = drizzle(sqlite, { schema });
export { schema };
