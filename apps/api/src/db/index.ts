import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../env";
import * as schema from "./schema";
import { runMigrations } from "./migrations";

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

  CREATE TABLE IF NOT EXISTS forgejo_accounts (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    access_token TEXT NOT NULL,
    created_at INTEGER NOT NULL
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
    theme TEXT NOT NULL DEFAULT 'dark',
    default_folder TEXT,
    default_agent_slug TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_slug TEXT NOT NULL,
    event_type TEXT NOT NULL,
    resource_path TEXT,
    summary TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    read_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications(user_id) WHERE read_at IS NULL;

  CREATE TABLE IF NOT EXISTS notification_prefs (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    telegram_enabled INTEGER NOT NULL DEFAULT 0,
    web_push_enabled INTEGER NOT NULL DEFAULT 0,
    mobile_push_enabled INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS telegram_links (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL UNIQUE,
    linked_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS telegram_link_codes (
    code TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user
    ON telegram_link_codes(user_id);

  CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_web_push_user
    ON web_push_subscriptions(user_id);

  CREATE TABLE IF NOT EXISTS mobile_push_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    device_id TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_mobile_push_user
    ON mobile_push_tokens(user_id);

  CREATE TABLE IF NOT EXISTS apple_iap_receipts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_transaction_id TEXT NOT NULL UNIQUE,
    latest_transaction_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    expires_at INTEGER,
    environment TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_apple_iap_user
    ON apple_iap_receipts(user_id);

  CREATE TABLE IF NOT EXISTS google_iap_purchases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purchase_token TEXT NOT NULL UNIQUE,
    product_id TEXT NOT NULL,
    expires_at INTEGER,
    acknowledged INTEGER NOT NULL DEFAULT 0,
    raw_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_google_iap_user
    ON google_iap_purchases(user_id);
`);

runMigrations(sqlite);

export const db = drizzle(sqlite, { schema });
export { schema };
