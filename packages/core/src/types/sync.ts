export type SyncPhase = "idle" | "fetching" | "merging" | "pushing" | "error";

export interface EncryptedSkipped {
  notes: number;
  tickets: number;
  links: number;
}

export interface SyncState {
  phase: SyncPhase;
  lastSyncedAt: string | null;
  pendingChanges: number;
  error: string | null;
  /**
   * Number of encrypted items the last pull saw but couldn't hydrate —
   * usually because this device's crypto identity isn't in the recipient
   * list (mid-pair, freshly added). Surfaced as a banner so users
   * understand why some items are invisible until they finish pairing.
   */
  encryptedSkipped: EncryptedSkipped;
}

export interface StorageAdapter {
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, contents: string, message: string): Promise<void>;
  deleteFile(path: string, message: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  pull(): Promise<void>;
  push(): Promise<void>;
  status(): Promise<SyncState>;
}
