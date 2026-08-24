import type {
  DirectoryLookup,
  DirectoryPublishInput,
  DirectoryRepository,
} from "../ports/out/DirectoryRepository";

/**
 * Public-key directory use cases for cross-user E2EE sharing. Behaviour is
 * identical to the previous directory route implementation; it now reads/writes
 * through the injected {@link DirectoryRepository} instead of Drizzle.
 */
export function createDirectory(repo: DirectoryRepository) {
  async function publishKeys(input: DirectoryPublishInput): Promise<void> {
    await repo.publishKeys(input);
  }

  async function lookupByEmail(email: string): Promise<DirectoryLookup | null> {
    return repo.lookupByEmail(email);
  }

  return { publishKeys, lookupByEmail };
}
