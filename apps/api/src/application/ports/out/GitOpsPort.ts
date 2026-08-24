import type { GitProvider } from "../../../domain/git-provider";

/**
 * Provider-agnostic git-backend operations the vault routes dispatch on. The
 * three concrete backends (GitHub, GitLab, NoteKit-hosted Forgejo) all expose
 * this same surface; the driven adapter binds one implementation per provider
 * so the driving layer never branches past {@link GitOpsResolverPort.resolve}.
 *
 * The transport DTO shapes below mirror what each backend returns — they are
 * the boundary types the routes read (e.g. `repo.full_name`, `commit.authorName`)
 * and stay structurally identical to the driven git wrappers so the public
 * `gitOps(provider)` surface is unchanged.
 */

export interface GitRepoDto {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  description: string | null;
  updated_at: string;
  size?: number;
}

export interface GitFileDto {
  path: string;
  sha: string;
  content: string;
}

export interface GitTreeEntryDto {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

export interface GitCommitDto {
  sha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  authorLogin: string | null;
  authorAvatar: string | null;
  authoredAt: string;
  url: string;
}

export interface GitAuthorDto {
  name: string;
  email: string;
}

export type GitCollaboratorPermission = "pull" | "push" | "admin" | "maintain" | "triage";

export interface GitCollaboratorDto {
  login: string;
  avatarUrl: string | null;
  htmlUrl: string;
  permission: GitCollaboratorPermission;
}

export interface GitInvitationDto {
  id: number;
  inviteeLogin: string;
  inviteeAvatar: string | null;
  permission: string;
  createdAt: string;
  htmlUrl: string;
}

/**
 * The unified set of git operations shared by every backend. Only the common
 * surface (present on GitHub, GitLab, and Forgejo alike) is modelled here.
 */
export interface GitOpsPort {
  listRepos(token: string): Promise<GitRepoDto[]>;
  createRepo(token: string, name: string, isPrivate: boolean): Promise<GitRepoDto>;
  getUserLogin(token: string): Promise<string>;
  readFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
    branch: string,
  ): Promise<GitFileDto | null>;
  writeFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
    contents: string,
    message: string,
    branch: string,
    prevSha?: string,
  ): Promise<{ sha: string }>;
  writeFileAs(
    token: string,
    owner: string,
    repo: string,
    path: string,
    contents: string,
    message: string,
    branch: string,
    author: GitAuthorDto,
    committer: GitAuthorDto,
  ): Promise<{ sha: string }>;
  commitFiles(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    files: { path: string; content: string }[],
    message: string,
    author?: GitAuthorDto,
    committer?: GitAuthorDto,
  ): Promise<{ commitSha: string }>;
  deleteFile(
    token: string,
    owner: string,
    repo: string,
    path: string,
    message: string,
    branch: string,
    prevSha: string,
  ): Promise<void>;
  listTree(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    prefix: string,
  ): Promise<GitTreeEntryDto[]>;
  listCommits(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    path: string | undefined,
    limit: number,
  ): Promise<GitCommitDto[]>;
  listCollaborators(token: string, owner: string, repo: string): Promise<GitCollaboratorDto[]>;
  addCollaborator(
    token: string,
    owner: string,
    repo: string,
    username: string,
    permission: GitCollaboratorPermission,
  ): Promise<{ status: 201 | 204; invitation: GitInvitationDto | null }>;
  removeCollaborator(token: string, owner: string, repo: string, username: string): Promise<void>;
  listInvitations(token: string, owner: string, repo: string): Promise<GitInvitationDto[]>;
  cancelInvitation(
    token: string,
    owner: string,
    repo: string,
    invitationId: number,
  ): Promise<void>;
}

/**
 * Resolves the git-operations implementation for a given provider. The driving
 * layer calls `resolve(provider)` and gets back a {@link GitOpsPort} — the exact
 * provider→backend mapping lives in the driven adapter.
 */
export interface GitOpsResolverPort {
  resolve(provider: GitProvider): GitOpsPort;
}
