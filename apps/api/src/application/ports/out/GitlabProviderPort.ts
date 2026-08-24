/**
 * Outbound port for the GitLab-specific API calls the vault provider use case
 * makes when connecting a personal access token. The generic repo operations
 * live on {@link GitOpsPort}; this port models only the connect-flow calls.
 */
export interface GitlabProviderPort {
  getUserLogin(token: string): Promise<string>;
  getCurrentUserInfo(token: string): Promise<{ id: number; username: string }>;
}
