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
    provider: text("provider", { enum: ["github", "google"] }).notNull(),
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
  provider: text("provider", { enum: ["github", "notekit"] }).notNull(),
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
    .default("auto"),
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

export type DbUser = typeof users.$inferSelect;
export type NewDbUser = typeof users.$inferInsert;
export type DbSession = typeof sessions.$inferSelect;
export type DbUserSettings = typeof userSettings.$inferSelect;
export type DbAgentToken = typeof agentTokens.$inferSelect;
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
