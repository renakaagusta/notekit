/**
 * Hand-rolled schema migration runner. Each migration is a `{id, up}` pair
 * applied exactly once, tracked in `schema_migrations`. New migrations
 * append to MIGRATIONS — never edit or reorder existing ones.
 *
 * We don't pull in drizzle-kit on purpose: the DB is small, the operations
 * are SQLite-only, and the ad-hoc loop here is easier to reason about than
 * an opaque codegen tool. If migrations get complicated, swap this out.
 */
import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

type Migration = { id: string; up: (db: Database.Database) => void };

const MIGRATIONS: Migration[] = [
  {
    id: "001_add_active_vault_id",
    up: (db) => {
      const cols = db
        .prepare(`PRAGMA table_info(user_settings)`)
        .all() as { name: string }[];
      if (cols.some((c) => c.name === "active_vault_id")) return;
      db.exec(
        `ALTER TABLE user_settings
           ADD COLUMN active_vault_id TEXT REFERENCES vaults(id) ON DELETE SET NULL`,
      );
    },
  },
  {
    id: "002_backfill_legacy_vaults",
    up: (db) => {
      // For any user_settings row that still carries the pre-multi-vault
      // columns and has no active_vault_id, materialize a vaults row and
      // pin the active pointer. ON CONFLICT keeps the migration safe to
      // retry — e.g. if the same user already created a vaults row via
      // the new API between releases.
      const rows = db
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
      if (rows.length === 0) return;

      const insertVault = db.prepare(
        `INSERT INTO vaults (id, user_id, provider, owner, repo, branch, label, created_at)
         VALUES (@id, @user_id, @provider, @owner, @repo, @branch, @label, @created_at)
         ON CONFLICT (user_id, provider, owner, repo) DO NOTHING`,
      );
      const findExisting = db.prepare(
        `SELECT id FROM vaults
          WHERE user_id = @user_id AND provider = @provider
            AND owner = @owner AND repo = @repo`,
      );
      const updateSettings = db.prepare(
        `UPDATE user_settings
            SET active_vault_id = @vault_id
          WHERE user_id = @user_id`,
      );

      const tx = db.transaction((rs: typeof rows) => {
        for (const r of rs) {
          const provider = (r.vault_provider ?? "github") as string;
          const newId = `vlt_${nanoid(16)}`;
          insertVault.run({
            id: newId,
            user_id: r.user_id,
            provider,
            owner: r.vault_owner,
            repo: r.vault_repo,
            branch: r.vault_branch ?? "main",
            label: `${r.vault_owner}/${r.vault_repo}`,
            created_at: Date.now(),
          });
          const existing = findExisting.get({
            user_id: r.user_id,
            provider,
            owner: r.vault_owner,
            repo: r.vault_repo,
          }) as { id: string } | undefined;
          if (existing) {
            updateSettings.run({ vault_id: existing.id, user_id: r.user_id });
          }
        }
      });
      tx(rows);
      console.log(
        `[db] migration 002: backfilled active_vault_id for ${rows.length} legacy row(s)`,
      );
    },
  },
  {
    id: "003_clear_legacy_vault_columns",
    up: (db) => {
      // The legacy user_settings.vault_* columns were kept as a fallback
      // through one release. Migration 002 has copied everything into
      // `vaults`; clear them now so a deleted vault (which sets
      // active_vault_id = NULL) can never re-fire backfill from stale data.
      db.exec(
        `UPDATE user_settings
            SET vault_provider = NULL,
                vault_owner = NULL,
                vault_repo = NULL
          WHERE active_vault_id IS NOT NULL`,
      );
    },
  },
  {
    id: "006_default_theme_dark",
    up: (db) => {
      db.exec(`UPDATE vault_settings SET theme = 'dark' WHERE theme = 'auto'`);
    },
  },
  {
    id: "005_create_forgejo_accounts",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS forgejo_accounts (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          username TEXT NOT NULL,
          access_token TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
    },
  },
  {
    id: "004_add_users_plus_columns",
    up: (db) => {
      const cols = db
        .prepare(`PRAGMA table_info(users)`)
        .all() as { name: string }[];
      if (!cols.some((c) => c.name === "plus_until")) {
        db.exec(`ALTER TABLE users ADD COLUMN plus_until INTEGER`);
      }
      if (!cols.some((c) => c.name === "plus_source")) {
        db.exec(`ALTER TABLE users ADD COLUMN plus_source TEXT`);
      }
    },
  },
  {
    id: "007_create_personal_access_tokens",
    up: (db) => {
      // Long-lived bearer tokens for CLI and MCP clients. See schema.ts for
      // the table doc-comment. Indexed by token_hash because that's the
      // lookup path on every authenticated bearer request.
      db.exec(`
        CREATE TABLE IF NOT EXISTS personal_access_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          scope TEXT NOT NULL CHECK (scope IN ('cli', 'mcp')),
          created_at INTEGER NOT NULL,
          last_used_at INTEGER,
          revoked_at INTEGER
        )
      `);
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_pat_user_id ON personal_access_tokens (user_id)`,
      );
    },
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
  const seen = new Set(
    (db.prepare(`SELECT id FROM schema_migrations`).all() as { id: string }[])
      .map((r) => r.id),
  );
  const record = db.prepare(
    `INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)`,
  );
  for (const m of MIGRATIONS) {
    if (seen.has(m.id)) continue;
    const tx = db.transaction(() => {
      m.up(db);
      record.run(m.id, Date.now());
    });
    tx();
    console.log(`[db] migration applied: ${m.id}`);
  }
}

