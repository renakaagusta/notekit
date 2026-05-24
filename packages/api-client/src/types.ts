// Wire-level types — the exact shapes the @notekit/api server sends and
// accepts over HTTP. This package intentionally has no other workspace
// dependencies so it can be imported by any surface (web, mobile, desktop,
// cli, mcp) without dragging React or Tiptap along.
//
// Mirrors packages/core/src/lib/*-api.ts (the typed wrappers the web app
// already uses). When you change a response shape on the server, update it
// here and in core's wrappers.

// ──────────────────────────────────────────────────────────────────────────
// shared domain types (kept structurally compatible with @notekit/core/types)
// ──────────────────────────────────────────────────────────────────────────

export type Plan = "free" | "plus" | "lifetime";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  plan: Plan;
  createdAt: string;
}

export type MemberKind = "user" | "agent";

export interface Member {
  kind: MemberKind;
  id: string;
  name: string;
}

// ──────────────────────────────────────────────────────────────────────────
// auth
// ──────────────────────────────────────────────────────────────────────────

export interface MeResponse {
  user: User | null;
}

export interface ProvidersResponse {
  github: boolean;
  google: boolean;
  apple?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// vault
// ──────────────────────────────────────────────────────────────────────────

export type VaultProvider = "github" | "gitlab" | "notekit";

export interface VaultRef {
  id?: string;
  provider?: VaultProvider;
  owner: string;
  repo: string;
  branch: string;
  label?: string | null;
}

export interface VaultStatus {
  configured: boolean;
  hasGithubToken: boolean;
  vault: VaultRef | null;
}

export interface VaultListResponse {
  activeId: string | null;
  vaults: VaultRef[];
}

export interface VaultRepo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
  updatedAt: string;
}

export interface VaultSettings {
  theme: "auto" | "light" | "dark";
  defaultFolder: string | null;
  defaultAgentSlug: string | null;
}

export interface VaultFile {
  path: string;
  sha: string | null;
  content: string | null;
}

export interface VaultCommit {
  sha: string;
  message: string;
  authorName: string | null;
  /** Author email from the commit object. Useful for matching against
   *  agent profiles client-side when the server hasn't enriched yet. */
  authorEmail: string | null;
  authorLogin: string | null;
  authorAvatar: string | null;
  authoredAt: string;
  url: string;
}

export type CollaboratorPermission = "pull" | "push" | "admin" | "maintain" | "triage";

export interface VaultMember {
  login: string;
  avatarUrl: string | null;
  htmlUrl: string;
  permission: CollaboratorPermission;
}

export interface VaultInvitation {
  id: number;
  inviteeLogin: string;
  inviteeAvatar: string | null;
  permission: string;
  createdAt: string;
  htmlUrl: string;
}

export interface VaultImportResult {
  imported: number;
  skipped: number;
  errors: { path: string; reason: string }[];
}

// ──────────────────────────────────────────────────────────────────────────
// agents
// ──────────────────────────────────────────────────────────────────────────

export interface AgentProfile {
  slug: string;
  name: string;
  /** Drives the agent's Gravatar lookup. Register this email at
   *  https://gravatar.com to give the agent a profile picture across
   *  NoteKit, GitHub commit pages, and Forgejo. */
  email: string;
  description: string;
  createdAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// notifications + iap
// ──────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────
// personal access tokens (CLI / MCP credentials)
// ──────────────────────────────────────────────────────────────────────────

export type PersonalAccessTokenScope = "cli" | "mcp";

export interface PersonalAccessTokenSummary {
  id: string;
  name: string;
  scope: PersonalAccessTokenScope;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Response from POST /auth/tokens. The plaintext `token` is shown exactly
 * once — clients must persist it immediately.
 */
export interface NewPersonalAccessToken {
  id: string;
  token: string;
  name: string;
  scope: PersonalAccessTokenScope;
  createdAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// sync
// ──────────────────────────────────────────────────────────────────────────

export interface VaultSyncResult {
  ok: true;
  vault: VaultRef;
  latestCommit: VaultCommit | null;
  syncedAt: string;
}

export interface NotificationItem {
  id: string;
  agentSlug: string;
  eventType: string;
  resourcePath: string | null;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPrefs {
  telegramEnabled: boolean;
  webPushEnabled: boolean;
  mobilePushEnabled: boolean;
}

export interface NotificationStatus {
  prefs: NotificationPrefs;
  channels: {
    telegram: { linked: boolean };
    webPush: { configured: boolean };
    mobilePush: { ios: boolean; android: boolean };
  };
}

export interface Entitlement {
  plus: boolean;
  plusUntil: string | null;
  plusSource: "apple" | "google" | "stripe" | "lifetime" | null;
  softLimits: { mobileFreeNotes: number };
}
