/**
 * Vault provider-connection use cases: GitLab PAT connect/disconnect/status,
 * GitHub App status/repos/create, and NoteKit-hosted Forgejo provision/repos.
 *
 * Behaviour is identical to the previous `routes/vault-providers` handlers; the
 * DB reads/writes, token encrypt/decrypt, and provider API calls now go through
 * injected ports instead of the concrete driven adapters. Transport concerns —
 * dev-token shortcuts, env gating, `GhError` -> HTTP mapping, rate limiting —
 * stay in the driving route. `GhError` is allowed to propagate so the route can
 * map it exactly as before.
 */
import type { ForgejoAccountRepository } from "../ports/out/ForgejoAccountRepository";
import type { GithubAppInstallationRepository } from "../ports/out/GithubAppInstallationRepository";
import type { GithubAppProviderPort } from "../ports/out/GithubAppProviderPort";
import type { GitlabProviderPort } from "../ports/out/GitlabProviderPort";
import type { GitOpsResolverPort, GitRepoDto } from "../ports/out/GitOpsPort";
import type { OAuthAccountRepository } from "../ports/out/OAuthAccountRepository";
import type { TokenCryptoPort } from "../ports/out/TokenCryptoPort";

export interface VaultProvidersDeps {
  oauthAccounts: OAuthAccountRepository;
  installations: GithubAppInstallationRepository;
  forgejoAccounts: ForgejoAccountRepository;
  tokenCrypto: TokenCryptoPort;
  gitlab: GitlabProviderPort;
  githubApp: GithubAppProviderPort;
  gitOps: GitOpsResolverPort;
}

export type ConnectGitlabResult =
  | { status: "ok"; login: string }
  | { status: "already_linked" };

export interface GithubAppStatus {
  installed: boolean;
  hasUserToken: boolean;
  accountLogin: string | null;
}

export type GithubAppReposResult =
  | { status: "not_installed" }
  | { status: "ok"; repos: GitRepoDto[] };

export type GithubAppCreateResult =
  | { status: "not_installed" }
  | { status: "reauth_required" }
  | { status: "ok"; repo: GitRepoDto };

async function connectGitlab(
  deps: VaultProvidersDeps,
  userId: string,
  token: string,
): Promise<ConnectGitlabResult> {
  const info = await deps.gitlab.getCurrentUserInfo(token);
  const encrypted = deps.tokenCrypto.encrypt(token);
  const providerAccountId = String(info.id);
  const existing = await deps.oauthAccounts.findByProviderAccount("gitlab", providerAccountId);
  if (existing && existing.userId !== userId) return { status: "already_linked" };
  if (existing) {
    await deps.oauthAccounts.updateAccessToken("gitlab", providerAccountId, encrypted);
  } else {
    await deps.oauthAccounts.insert({
      provider: "gitlab",
      providerAccountId,
      userId,
      accessToken: encrypted,
    });
  }
  return { status: "ok", login: info.username };
}

async function getGithubAppStatus(
  deps: VaultProvidersDeps,
  userId: string,
): Promise<GithubAppStatus> {
  const inst = await deps.installations.findByUser(userId);
  return {
    installed: !!inst,
    hasUserToken: !!inst?.userToken,
    accountLogin: inst?.accountLogin ?? null,
  };
}

async function listGithubAppRepos(
  deps: VaultProvidersDeps,
  userId: string,
): Promise<GithubAppReposResult> {
  const inst = await deps.installations.findByUser(userId);
  if (!inst) return { status: "not_installed" };
  const repos = await deps.githubApp.listInstallationRepos(inst.installationId);
  return { status: "ok", repos };
}

async function createGithubAppRepo(
  deps: VaultProvidersDeps,
  userId: string,
  name: string,
  isPrivate: boolean,
): Promise<GithubAppCreateResult> {
  const inst = await deps.installations.findByUser(userId);
  if (!inst) return { status: "not_installed" };
  if (!inst.userToken) return { status: "reauth_required" };
  const userToken = deps.tokenCrypto.decrypt(inst.userToken);
  const repo = await deps.githubApp.createUserRepo(userToken, name, isPrivate);
  try {
    await deps.githubApp.addRepoToInstallation(userToken, inst.installationId, repo.id);
  } catch {
    /* all-repos install or manual grant */
  }
  return { status: "ok", repo };
}

export function createVaultProviders(deps: VaultProvidersDeps) {
  return {
    githubAppConfigured: (): boolean => deps.githubApp.configured(),
    getGitlabLogin: (token: string): Promise<string> => deps.gitlab.getUserLogin(token),
    connectGitlab: (userId: string, token: string): Promise<ConnectGitlabResult> =>
      connectGitlab(deps, userId, token),
    disconnectGitlab: (userId: string): Promise<void> =>
      deps.oauthAccounts.deleteForUser("gitlab", userId),
    getGithubAppStatus: (userId: string): Promise<GithubAppStatus> =>
      getGithubAppStatus(deps, userId),
    listGithubAppRepos: (userId: string): Promise<GithubAppReposResult> =>
      listGithubAppRepos(deps, userId),
    createGithubAppRepo: (
      userId: string,
      name: string,
      isPrivate: boolean,
    ): Promise<GithubAppCreateResult> => createGithubAppRepo(deps, userId, name, isPrivate),
    getForgejoAccount: (userId: string) => deps.forgejoAccounts.get(userId),
    provisionForgejo: (userId: string, email: string, displayName: string | null) =>
      deps.forgejoAccounts.provision(userId, email, displayName),
    listForgejoRepos: (token: string): Promise<GitRepoDto[]> =>
      deps.gitOps.resolve("notekit").listRepos(token),
    createForgejoRepo: (token: string, name: string, isPrivate: boolean): Promise<GitRepoDto> =>
      deps.gitOps.resolve("notekit").createRepo(token, name, isPrivate),
  };
}
