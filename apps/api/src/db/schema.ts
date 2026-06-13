import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  plan: text("plan", { enum: ["free", "plus", "lifetime"] })
    .notNull()
    .default("free"),
  plusUntil: integer("plus_until", { mode: "timestamp_ms" }),
  plusSource: text("plus_source", {
    enum: ["apple", "google", "stripe", "lifetime"],
  }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  {
    // "github" + "google" + "apple" are sign-in providers.
    // "gitlab" is a storage-only connection — a PAT the user pastes so we
    // can sync their vault to gitlab.com. It never authenticates a session.
    // SQLite stores the value as text; the enum is purely a TS hint, so
    // adding a new option doesn't need a migration. Keep the comment in
    // sync with what auth/upsert.ts accepts though.
    provider: text("provider", { enum: ["github", "google", "apple", "gitlab"] }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const vaults = sqliteTable("vaults", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["github", "gitlab", "notekit"] }).notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull().default("main"),
  label: text("label"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const vaultSettings = sqliteTable("vault_settings", {
  vaultId: text("vault_id")
    .primaryKey()
    .references(() => vaults.id, { onDelete: "cascade" }),
  theme: text("theme", { enum: ["auto", "light", "dark"] })
    .notNull()
    .default("dark"),
  defaultFolder: text("default_folder"),
  defaultAgentSlug: text("default_agent_slug"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  activeVaultId: text("active_vault_id").references(() => vaults.id, {
    onDelete: "set null",
  }),
  // Legacy single-vault columns. Kept for one release as a fallback; new code
  // writes to `vaults` + `active_vault_id` only. Will be dropped in a later migration.
  vaultProvider: text("vault_provider", { enum: ["github"] }),
  vaultOwner: text("vault_owner"),
  vaultRepo: text("vault_repo"),
  vaultBranch: text("vault_branch").default("main"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const forgejoAccounts = sqliteTable("forgejo_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  accessToken: text("access_token").notNull(),
  // Hard cap on the user's NoteKit-hosted vault size, in bytes. Default
  // 100 MB matches the migration default. The entitlement layer reads
  // this column but free/plus tiers may override it at read time.
  quotaBytes: integer("quota_bytes").notNull().default(104857600),
  // Most-recent observed total repo size across the user's Forgejo repos.
  // Refreshed by the usage-recompute job; treat as an estimate, not a
  // truth — a fast burst of writes can blow past it before the next refresh.
  usedBytes: integer("used_bytes").notNull().default(0),
  usageUpdatedAt: integer("usage_updated_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const agentTokens = sqliteTable("agent_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentSlug: text("agent_slug").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
});

/**
 * Personal access tokens — long-lived bearer credentials a user mints to give
 * to their own CLI or MCP client. Distinct from `agent_tokens` (which are
 * scoped to an agent persona inside a vault). The plaintext is shown to the
 * user exactly once at creation and never stored; the `token_hash` column
 * holds a sha256 of the token so `Authorization: Bearer <token>` lookups
 * stay constant-time.
 */
export const personalAccessTokens = sqliteTable("personal_access_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Human label so the user can tell two tokens apart in the management UI. */
  name: text("name").notNull(),
  /** sha256 of the plaintext token. Plaintext is never stored. */
  tokenHash: text("token_hash").notNull().unique(),
  /** Where the token is intended to be used. Informational; not enforced. */
  scope: text("scope", { enum: ["cli", "mcp"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentSlug: text("agent_slug").notNull(),
  eventType: text("event_type").notNull(),
  resourcePath: text("resource_path"),
  summary: text("summary").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
});

export const notificationPrefs = sqliteTable("notification_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  telegramEnabled: integer("telegram_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  webPushEnabled: integer("web_push_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  mobilePushEnabled: integer("mobile_push_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const telegramLinks = sqliteTable("telegram_links", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  chatId: text("chat_id").notNull().unique(),
  linkedAt: integer("linked_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const telegramLinkCodes = sqliteTable("telegram_link_codes", {
  code: text("code").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const webPushSubscriptions = sqliteTable("web_push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const mobilePushTokens = sqliteTable("mobile_push_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: ["ios", "android"] }).notNull(),
  token: text("token").notNull().unique(),
  deviceId: text("device_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const appleIapReceipts = sqliteTable("apple_iap_receipts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  originalTransactionId: text("original_transaction_id").notNull().unique(),
  latestTransactionId: text("latest_transaction_id").notNull(),
  productId: text("product_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  environment: text("environment", { enum: ["sandbox", "production"] }).notNull(),
  rawJson: text("raw_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const googleIapPurchases = sqliteTable("google_iap_purchases", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purchaseToken: text("purchase_token").notNull().unique(),
  productId: text("product_id").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  acknowledged: integer("acknowledged", { mode: "boolean" })
    .notNull()
    .default(false),
  rawJson: text("raw_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Public-key directory for cross-user E2EE sharing. Each user publishes their
 * recovery signing key + device pubkeys here so others can encrypt to them
 * (their keys live in their own git vault, unreadable to anyone else). PUBLIC
 * keys only — content stays zero-knowledge. The server stores; it never
 * verifies signatures (the consuming client does, against `signingKey` + a
 * safety number). See docs/architecture/e2ee-everywhere-and-sharing.md §3.
 */
export const userSigningKeys = sqliteTable("user_signing_keys", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Base64 Ed25519 recovery signing public key — the user's trust root. */
  signingKey: text("signing_key").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userDirectoryDevices = sqliteTable(
  "user_directory_devices",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    /** Human label for the device, shown when an owner admits the member. */
    name: text("name"),
    /** age recipient (public key) the inviter encrypts shared items to. */
    recipient: text("recipient").notNull(),
    addedAt: text("added_at").notNull(),
    /**
     * The member this device belongs to (first-class membership). Bound into
     * the signature, so an owner who admits this member copies the record
     * verbatim and it still verifies against the member's signing key.
     */
    owner: text("owner"),
    /** Member/recovery signature over the device record; verified client-side. */
    sig: text("sig"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.userId, table.deviceId] })],
);

export type DbForgejoAccount = typeof forgejoAccounts.$inferSelect;
export type DbUser = typeof users.$inferSelect;
export type NewDbUser = typeof users.$inferInsert;
export type DbSession = typeof sessions.$inferSelect;
export type DbUserSettings = typeof userSettings.$inferSelect;
export type DbAgentToken = typeof agentTokens.$inferSelect;
export type DbPersonalAccessToken = typeof personalAccessTokens.$inferSelect;
export type NewDbPersonalAccessToken = typeof personalAccessTokens.$inferInsert;
export type DbVault = typeof vaults.$inferSelect;
export type NewDbVault = typeof vaults.$inferInsert;
export type DbVaultSettings = typeof vaultSettings.$inferSelect;
export type DbNotification = typeof notifications.$inferSelect;
export type DbNotificationPrefs = typeof notificationPrefs.$inferSelect;
export type DbTelegramLink = typeof telegramLinks.$inferSelect;
export type DbWebPushSubscription = typeof webPushSubscriptions.$inferSelect;
export type DbMobilePushToken = typeof mobilePushTokens.$inferSelect;
export type DbAppleIapReceipt = typeof appleIapReceipts.$inferSelect;
export type DbGoogleIapPurchase = typeof googleIapPurchases.$inferSelect;
export type DbUserSigningKey = typeof userSigningKeys.$inferSelect;
export type DbUserDirectoryDevice = typeof userDirectoryDevices.$inferSelect;
