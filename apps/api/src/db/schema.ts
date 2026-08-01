import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  plan: text("plan", { enum: ["free", "plus", "lifetime"] })
    .notNull()
    .default("free"),
  plusUntil: bigint("plus_until", { mode: "number" }),
  plusSource: text("plus_source", {
    enum: ["apple", "google", "stripe", "lifetime"],
  }),
  createdAt: bigint("created_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: text("provider", { enum: ["github", "google", "apple", "gitlab"] }).notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    createdAt: bigint("created_at", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ],
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  createdAt: bigint("created_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const vaults = pgTable("vaults", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["github", "gitlab", "notekit"] }).notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  branch: text("branch").notNull().default("main"),
  label: text("label"),
  createdAt: bigint("created_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const vaultSettings = pgTable("vault_settings", {
  vaultId: text("vault_id")
    .primaryKey()
    .references(() => vaults.id, { onDelete: "cascade" }),
  theme: text("theme", { enum: ["auto", "light", "dark"] })
    .notNull()
    .default("dark"),
  defaultFolder: text("default_folder"),
  defaultAgentSlug: text("default_agent_slug"),
  updatedAt: bigint("updated_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  activeVaultId: text("active_vault_id").references(() => vaults.id, {
    onDelete: "set null",
  }),
  vaultProvider: text("vault_provider", { enum: ["github"] }),
  vaultOwner: text("vault_owner"),
  vaultRepo: text("vault_repo"),
  vaultBranch: text("vault_branch").default("main"),
  updatedAt: bigint("updated_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const forgejoAccounts = pgTable("forgejo_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  accessToken: text("access_token").notNull(),
  quotaBytes: integer("quota_bytes").notNull().default(104857600),
  usedBytes: integer("used_bytes").notNull().default(0),
  usageUpdatedAt: bigint("usage_updated_at", { mode: "number" }),
  createdAt: bigint("created_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const agentTokens = pgTable("agent_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentSlug: text("agent_slug").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: bigint("created_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
  revokedAt: bigint("revoked_at", { mode: "number" }),
});

export const personalAccessTokens = pgTable("personal_access_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scope: text("scope", { enum: ["cli", "mcp"] }).notNull(),
  createdAt: bigint("created_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
  lastUsedAt: bigint("last_used_at", { mode: "number" }),
  revokedAt: bigint("revoked_at", { mode: "number" }),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentSlug: text("agent_slug").notNull(),
  eventType: text("event_type").notNull(),
  resourcePath: text("resource_path"),
  summary: text("summary").notNull(),
  payload: text("payload").notNull(),
  createdAt: bigint("created_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
  readAt: bigint("read_at", { mode: "number" }),
});

export const notificationPrefs = pgTable("notification_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  telegramEnabled: boolean("telegram_enabled").notNull().default(false),
  webPushEnabled: boolean("web_push_enabled").notNull().default(false),
  mobilePushEnabled: boolean("mobile_push_enabled").notNull().default(false),
  updatedAt: bigint("updated_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const telegramLinks = pgTable("telegram_links", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  chatId: text("chat_id").notNull().unique(),
  linkedAt: bigint("linked_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const telegramLinkCodes = pgTable("telegram_link_codes", {
  code: text("code").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

export const webPushSubscriptions = pgTable("web_push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: bigint("created_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const mobilePushTokens = pgTable("mobile_push_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: ["ios", "android"] }).notNull(),
  token: text("token").notNull().unique(),
  deviceId: text("device_id"),
  createdAt: bigint("created_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const appleIapReceipts = pgTable("apple_iap_receipts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  originalTransactionId: text("original_transaction_id").notNull().unique(),
  latestTransactionId: text("latest_transaction_id").notNull(),
  productId: text("product_id").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }),
  environment: text("environment", { enum: ["sandbox", "production"] }).notNull(),
  rawJson: text("raw_json").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const googleIapPurchases = pgTable("google_iap_purchases", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  purchaseToken: text("purchase_token").notNull().unique(),
  productId: text("product_id").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }),
  acknowledged: boolean("acknowledged").notNull().default(false),
  rawJson: text("raw_json").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const userSigningKeys = pgTable("user_signing_keys", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  signingKey: text("signing_key").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const userDirectoryDevices = pgTable(
  "user_directory_devices",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    name: text("name"),
    recipient: text("recipient").notNull(),
    addedAt: text("added_at").notNull(),
    owner: text("owner"),
    sig: text("sig"),
    updatedAt: bigint("updated_at", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
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
