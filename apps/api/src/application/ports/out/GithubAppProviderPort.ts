import type { GitRepoDto } from "./GitOpsPort";

/**
 * Outbound port for the GitHub App backend operations the vault provider use
 * case invokes: checking configuration, listing installation repos, and
 * creating a user repo then attaching it to the installation.
 */
export interface GithubAppProviderPort {
  configured(): boolean;
  /** Exchange an OAuth `code` (from the install/authorize redirect) for a user token. */
  exchangeUserCode(code: string): Promise<{ token: string; refreshToken: string | null }>;
  listInstallationRepos(installationId: number): Promise<GitRepoDto[]>;
  createUserRepo(userToken: string, name: string, isPrivate: boolean): Promise<GitRepoDto>;
  addRepoToInstallation(
    userToken: string,
    installationId: number,
    repoId: number,
  ): Promise<void>;
}
