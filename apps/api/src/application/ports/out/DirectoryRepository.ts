/**
 * Outbound port for the public-key directory. The directory use case depends on
 * this instead of Drizzle, so the Postgres queries live in a driven adapter.
 *
 * Stores public keys only, never private keys or content (see the directory
 * route for the zero-knowledge rationale).
 */
export interface DirectoryDeviceInput {
  deviceId: string;
  name?: string;
  recipient: string;
  addedAt: string;
  owner?: string;
  sig?: string;
}

export interface DirectoryDeviceRecord {
  deviceId: string;
  name: string | null;
  recipient: string;
  addedAt: string;
  owner: string | null;
  sig: string | null;
}

export interface DirectoryRepository {
  /** Upsert the caller's signing key and replace their published device set. */
  publishKeys(
    userId: string,
    signingKey: string,
    devices: DirectoryDeviceInput[],
  ): Promise<void>;

  /** Resolve a user id by email, or null when no such user exists. */
  findUserIdByEmail(email: string): Promise<string | null>;

  /** The user's published signing key, or null when they published none. */
  findSigningKey(userId: string): Promise<string | null>;

  /** The user's published device records. */
  listDevices(userId: string): Promise<DirectoryDeviceRecord[]>;
}
