import type {
  DirectoryDeviceInput,
  DirectoryDeviceRecord,
  DirectoryRepository,
} from "../ports/out/DirectoryRepository";

export interface DirectoryLookup {
  signingKey: string;
  devices: DirectoryDeviceRecord[];
}

/**
 * Public-key directory for cross-user E2EE sharing. Behaviour is identical to
 * the previous route-inlined implementation; it now reads/writes through the
 * injected {@link DirectoryRepository} instead of Drizzle.
 */
export function createDirectory(repo: DirectoryRepository) {
  async function publishKeys(
    userId: string,
    signingKey: string,
    devices: DirectoryDeviceInput[],
  ): Promise<void> {
    await repo.publishKeys(userId, signingKey, devices);
  }

  /**
   * Look up a user's published keys by email. Returns null when the user does
   * not exist OR published nothing — the route must not distinguish the two, so
   * the directory can't be used to enumerate who has an account.
   */
  async function lookupByEmail(email: string): Promise<DirectoryLookup | null> {
    const userId = await repo.findUserIdByEmail(email);
    if (!userId) return null;
    const signingKey = await repo.findSigningKey(userId);
    if (!signingKey) return null;
    const devices = await repo.listDevices(userId);
    return { signingKey, devices };
  }

  return { publishKeys, lookupByEmail };
}
