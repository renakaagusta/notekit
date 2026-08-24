/**
 * Outbound port for the cross-user public-key directory. The directory use case
 * depends on this instead of Drizzle, so the Postgres queries live in a driven
 * adapter.
 */
export interface DirectoryDevice {
  deviceId: string;
  name: string | null;
  recipient: string;
  addedAt: string;
  owner: string | null;
  sig: string | null;
}

export interface DirectoryPublishInput {
  userId: string;
  signingKey: string;
  devices: DirectoryDevice[];
}

export interface DirectoryLookup {
  signingKey: string;
  devices: DirectoryDevice[];
}

export interface DirectoryRepository {
  /**
   * Publish the caller's public keys: upsert their signing key and replace their
   * device set wholesale. Uses a single shared timestamp across the signing-key
   * upsert and the device rows.
   */
  publishKeys(input: DirectoryPublishInput): Promise<void>;

  /**
   * Look up a user's published public keys by email. Returns null when there is
   * no such user, or the user has published no signing key.
   */
  lookupByEmail(email: string): Promise<DirectoryLookup | null>;
}
