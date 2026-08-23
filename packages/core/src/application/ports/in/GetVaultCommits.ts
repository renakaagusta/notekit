import type { VaultCommit } from "../out/VaultPort";

/**
 * Inbound port: read the vault's recent commit history, optionally scoped to a
 * path. Driving adapters (history, calendar, heatmap, search UIs) depend on this
 * capability; the use case behind it reads through the outbound {@link VaultPort}
 * so the UI never touches the git transport directly.
 */
export type GetVaultCommits = (
  path?: string,
  limit?: number,
) => Promise<{ commits: VaultCommit[] }>;
