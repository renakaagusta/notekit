import type { Pool, PoolClient } from "pg";
import { nanoid } from "nanoid";

type Migration = { id: string; up: (client: PoolClient) => Promise<void> };

async function hasColumn(client: PoolClient, table: string, column: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
    [table, column],
  );
  return (res.rowCount ?? 0) > 0;
}

const MIGRATIONS: Migration[] = [
  {
    id: "000_initial_schema",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT,
          avatar_url TEXT,
          plan TEXT NOT NULL DEFAULT 'free',
          created_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS oauth_accounts (
          provider TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          access_token TEXT,
          refresh_token TEXT,
          created_at BIGINT NOT NULL,
          PRIMARY KEY (provider, provider_account_id)
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at BIGINT NOT NULL,
          created_at BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

        CREATE TABLE IF NOT EXISTS user_settings (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          vault_provider TEXT,
          vault_owner TEXT,
          vault_repo TEXT,
          vault_branch TEXT DEFAULT 'main',
          updated_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vaults (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          owner TEXT NOT NULL,
          repo TEXT NOT NULL,
          branch TEXT NOT NULL DEFAULT 'main',
          label TEXT,
          created_at BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_vaults_user_id ON vaults(user_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_vaults_user_provider_owner_repo
          ON vaults(user_id, provider, owner, repo);

        CREATE TABLE IF NOT EXISTS vault_settings (
          vault_id TEXT PRIMARY KEY REFERENCES vaults(id) ON DELETE CASCADE,
          theme TEXT NOT NULL DEFAULT 'dark',
          default_folder TEXT,
          default_agent_slug TEXT,
          updated_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          agent_slug TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          created_at BIGINT NOT NULL,
          revoked_at BIGINT
        );

        CREATE INDEX IF NOT EXISTS idx_agent_tokens_hash ON agent_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_agent_tokens_user_slug ON agent_tokens(user_id, agent_slug);

        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          agent_slug TEXT NOT NULL,
          event_type TEXT NOT NULL,
          resource_path TEXT,
          summary TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          read_at BIGINT
        );

        CREATE INDEX IF NOT EXISTS idx_notifications_user_created
          ON notifications(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
          ON notifications(user_id) WHERE read_at IS NULL;

        CREATE TABLE IF NOT EXISTS notification_prefs (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          web_push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          mobile_push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          updated_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS telegram_links (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          chat_id TEXT NOT NULL UNIQUE,
          linked_at BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS telegram_link_codes (
          code TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at BIGINT NOT NULL
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
          created_at BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_web_push_user ON web_push_subscriptions(user_id);

        CREATE TABLE IF NOT EXISTS mobile_push_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          platform TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          device_id TEXT,
          created_at BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_mobile_push_user ON mobile_push_tokens(user_id);

        CREATE TABLE IF NOT EXISTS apple_iap_receipts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          original_transaction_id TEXT NOT NULL UNIQUE,
          latest_transaction_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          expires_at BIGINT,
          environment TEXT NOT NULL,
          raw_json TEXT NOT NULL,
          updated_at BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_apple_iap_user ON apple_iap_receipts(user_id);

        CREATE TABLE IF NOT EXISTS google_iap_purchases (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          purchase_token TEXT NOT NULL UNIQUE,
          product_id TEXT NOT NULL,
          expires_at BIGINT,
          acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
          raw_json TEXT NOT NULL,
          updated_at BIGINT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_google_iap_user ON google_iap_purchases(user_id);
      `);
    },
  },
  {
    id: "001_add_active_vault_id",
    up: async (client) => {
      if (!(await hasColumn(client, "user_settings", "active_vault_id"))) {
        await client.query(
          `ALTER TABLE user_settings
             ADD COLUMN active_vault_id TEXT REFERENCES vaults(id) ON DELETE SET NULL`,
        );
      }
    },
  },
  {
    id: "002_backfill_legacy_vaults",
    up: async (client) => {
      const { rows } = await client.query<{
        user_id: string;
        vault_provider: string | null;
        vault_owner: string;
        vault_repo: string;
        vault_branch: string | null;
      }>(
        `SELECT user_id, vault_provider, vault_owner, vault_repo, vault_branch
           FROM user_settings
          WHERE active_vault_id IS NULL
            AND vault_owner IS NOT NULL
            AND vault_repo IS NOT NULL`,
      );
      if (rows.length === 0) return;

      for (const r of rows) {
        const provider = r.vault_provider ?? "github";
        const newId = `vlt_${nanoid(16)}`;
        await client.query(
          `INSERT INTO vaults (id, user_id, provider, owner, repo, branch, label, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, provider, owner, repo) DO NOTHING`,
          [newId, r.user_id, provider, r.vault_owner, r.vault_repo, r.vault_branch ?? "main",
           `${r.vault_owner}/${r.vault_repo}`, Date.now()],
        );
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM vaults WHERE user_id=$1 AND provider=$2 AND owner=$3 AND repo=$4`,
          [r.user_id, provider, r.vault_owner, r.vault_repo],
        );
        if (existing.rows[0]) {
          await client.query(
            `UPDATE user_settings SET active_vault_id=$1 WHERE user_id=$2`,
            [existing.rows[0].id, r.user_id],
          );
        }
      }
      console.log(`[db] migration 002: backfilled active_vault_id for ${rows.length} legacy row(s)`);
    },
  },
  {
    id: "003_clear_legacy_vault_columns",
    up: async (client) => {
      await client.query(
        `UPDATE user_settings
            SET vault_provider = NULL,
                vault_owner = NULL,
                vault_repo = NULL
          WHERE active_vault_id IS NOT NULL`,
      );
    },
  },
  {
    id: "004_add_users_plus_columns",
    up: async (client) => {
      if (!(await hasColumn(client, "users", "plus_until"))) {
        await client.query(`ALTER TABLE users ADD COLUMN plus_until BIGINT`);
      }
      if (!(await hasColumn(client, "users", "plus_source"))) {
        await client.query(`ALTER TABLE users ADD COLUMN plus_source TEXT`);
      }
    },
  },
  {
    id: "005_create_forgejo_accounts",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS forgejo_accounts (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          username TEXT NOT NULL,
          access_token TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `);
    },
  },
  {
    id: "006_default_theme_dark",
    up: async (client) => {
      await client.query(`UPDATE vault_settings SET theme = 'dark' WHERE theme = 'auto'`);
    },
  },
  {
    id: "007_create_personal_access_tokens",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS personal_access_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          scope TEXT NOT NULL CHECK (scope IN ('cli', 'mcp')),
          created_at BIGINT NOT NULL,
          last_used_at BIGINT,
          revoked_at BIGINT
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_pat_user_id ON personal_access_tokens (user_id)`,
      );
    },
  },
  {
    id: "008_forgejo_storage_quota",
    up: async (client) => {
      if (!(await hasColumn(client, "forgejo_accounts", "quota_bytes"))) {
        await client.query(
          `ALTER TABLE forgejo_accounts ADD COLUMN quota_bytes INTEGER NOT NULL DEFAULT 104857600`,
        );
      }
      if (!(await hasColumn(client, "forgejo_accounts", "used_bytes"))) {
        await client.query(
          `ALTER TABLE forgejo_accounts ADD COLUMN used_bytes INTEGER NOT NULL DEFAULT 0`,
        );
      }
      if (!(await hasColumn(client, "forgejo_accounts", "usage_updated_at"))) {
        await client.query(
          `ALTER TABLE forgejo_accounts ADD COLUMN usage_updated_at BIGINT`,
        );
      }
    },
  },
  {
    id: "009_agent_avatar_cache",
    up: async (_client) => {
      // Historical: no-op. Superseded by migration 010.
    },
  },
  {
    id: "010_drop_agent_avatars",
    up: async (client) => {
      await client.query(`DROP TABLE IF EXISTS agent_avatars`);
    },
  },
  {
    id: "011_user_key_directory",
    up: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_signing_keys (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          signing_key TEXT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_directory_devices (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          device_id TEXT NOT NULL,
          recipient TEXT NOT NULL,
          added_at TEXT NOT NULL,
          sig TEXT,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (user_id, device_id)
        )
      `);
    },
  },
  {
    id: "012_directory_devices_name_owner",
    up: async (client) => {
      if (!(await hasColumn(client, "user_directory_devices", "name"))) {
        await client.query(`ALTER TABLE user_directory_devices ADD COLUMN name TEXT`);
      }
      if (!(await hasColumn(client, "user_directory_devices", "owner"))) {
        await client.query(`ALTER TABLE user_directory_devices ADD COLUMN owner TEXT`);
      }
    },
  },
];

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at BIGINT NOT NULL
      )
    `);
    const { rows } = await client.query<{ id: string }>(`SELECT id FROM schema_migrations`);
    const seen = new Set(rows.map((r) => r.id));

    for (const m of MIGRATIONS) {
      if (seen.has(m.id)) continue;
      await client.query("BEGIN");
      try {
        await m.up(client);
        await client.query(`INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)`, [
          m.id,
          Date.now(),
        ]);
        await client.query("COMMIT");
        console.log(`[db] migration applied: ${m.id}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
}
