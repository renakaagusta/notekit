/** A provisioned NoteKit-hosted Forgejo account for a user. */
export interface ForgejoAccountRecord {
  username: string;
  token: string;
}

/**
 * Outbound port for the lifecycle of per-user Forgejo accounts (the managed
 * NoteKit-hosted vault backend). The vault provider use case depends on this
 * instead of the concrete `vault/forgejoAccounts` driven adapter.
 */
export interface ForgejoAccountRepository {
  get(userId: string): Promise<ForgejoAccountRecord | null>;
  provision(
    userId: string,
    email: string,
    displayName: string | null,
  ): Promise<ForgejoAccountRecord>;
}
