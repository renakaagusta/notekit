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

export type VaultProvider = "github" | "gitlab" | "notekit";

export interface VaultRef {
  /** Server-side id. Undefined on responses from older API revisions. */
  id?: string;
  provider?: VaultProvider;
  owner: string;
  repo: string;
  branch: string;
  /** Friendly name for the switcher. */
  label?: string | null;
}

export interface VaultStatus {
  configured: boolean;
  hasGithubToken: boolean;
  hasGitlabToken?: boolean;
  vault: VaultRef | null;
}

export interface VaultListResponse {
  activeId: string | null;
  vaults: VaultRef[];
}

export interface VaultSettings {
  theme: "auto" | "light" | "dark";
  defaultFolder: string | null;
  defaultAgentSlug: string | null;
}

export interface VaultImportResult {
  imported: number;
  skipped: number;
  errors: { path: string; reason: string }[];
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

export interface PairAnnouncement {
  code: string;
  pubkey: string;
  deviceName: string;
  deviceId: string;
  expiresAt: string;
}
