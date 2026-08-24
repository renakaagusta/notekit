/**
 * Composition root for the vault provider-connection routes: binds the vault
 * provider use case to its Drizzle-, crypto-, and git-backend driven adapters,
 * and wires the vault-token resolver the Forgejo endpoints need. The driving
 * route imports the wired functions here so it never reaches into a driven
 * adapter.
 */
import { tokenCryptoPort } from "../adapters/driven/auth/tokenCryptoPort";
import { githubAppInstallationRepository } from "../adapters/driven/db/githubAppInstallationRepository";
import { oauthAccountRepository } from "../adapters/driven/db/oauthAccountRepository";
import { githubAppProviderPort } from "../adapters/driven/git/githubAppProviderPort";
import { gitlabProviderPort } from "../adapters/driven/git/gitlabProviderPort";
import { forgejoAccountRepository } from "../adapters/driven/vault/forgejoAccountRepository";
import { gitOpsResolver } from "../adapters/driven/vault/gitOpsResolver";
import { vaultTokenPort } from "../adapters/driven/vault/vaultTokenPort";
import { createVaultProviders } from "../application/usecases/vaultProviders";

const vaultProviders = createVaultProviders({
  oauthAccounts: oauthAccountRepository,
  installations: githubAppInstallationRepository,
  forgejoAccounts: forgejoAccountRepository,
  tokenCrypto: tokenCryptoPort,
  gitlab: gitlabProviderPort,
  githubApp: githubAppProviderPort,
  gitOps: gitOpsResolver,
});

export const githubAppConfigured = vaultProviders.githubAppConfigured;
export const getGitlabLogin = vaultProviders.getGitlabLogin;
export const connectGitlab = vaultProviders.connectGitlab;
export const disconnectGitlab = vaultProviders.disconnectGitlab;
export const getGithubAppStatus = vaultProviders.getGithubAppStatus;
export const listGithubAppRepos = vaultProviders.listGithubAppRepos;
export const createGithubAppRepo = vaultProviders.createGithubAppRepo;
export const getForgejoAccount = vaultProviders.getForgejoAccount;
export const provisionForgejo = vaultProviders.provisionForgejo;
export const listForgejoRepos = vaultProviders.listForgejoRepos;
export const createForgejoRepo = vaultProviders.createForgejoRepo;

export const getVaultToken = vaultTokenPort.getVaultToken;
