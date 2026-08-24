/**
 * The subset of a GitHub App installation row the vault provider use case reads
 * to talk to the App on behalf of a user.
 */
export interface GithubAppInstallationRow {
  installationId: number;
  accountLogin: string | null;
  userToken: string | null;
}

/**
 * Outbound port for the `github_app_installations` table. The vault provider use
 * case depends on this instead of Drizzle directly.
 */
export interface GithubAppInstallationRepository {
  findByUser(userId: string): Promise<GithubAppInstallationRow | null>;
}
