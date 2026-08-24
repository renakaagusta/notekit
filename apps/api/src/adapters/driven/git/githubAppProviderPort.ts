import type { GithubAppProviderPort } from "../../../application/ports/out/GithubAppProviderPort";
import {
  addRepoToInstallation,
  createUserRepo,
  githubAppConfigured,
  listInstallationRepos,
} from "./github-app";

/** GitHub App implementation of {@link GithubAppProviderPort}. */
export const githubAppProviderPort: GithubAppProviderPort = {
  configured: githubAppConfigured,
  listInstallationRepos,
  createUserRepo,
  addRepoToInstallation,
};
