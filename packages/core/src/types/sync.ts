export type SyncPhase = "idle" | "fetching" | "merging" | "pushing" | "error";

export interface SyncState {
  phase: SyncPhase;
  lastSyncedAt: string | null;
  pendingChanges: number;
  error: string | null;
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
