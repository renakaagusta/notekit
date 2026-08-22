/**
 * Outbound ports: the capabilities the application layer needs from the outside
 * world. Each is a pure interface; concrete driven adapters implement them and
 * are bound in the composition root.
 *
 * More ports (Vault, Sync, Crypto, Storage, Notifier, Logger, Gravatar) land as
 * their consuming use cases are extracted — see docs hexagonal migration plan.
 */
export type { ClockPort } from "./ClockPort";
export type { IdGeneratorPort } from "./IdGeneratorPort";
export type { RandomPort } from "./RandomPort";
export type {
  VaultPort,
  VaultFile,
  VaultFileEntry,
  VaultCommit,
} from "./VaultPort";
export type { LoggerPort } from "./LoggerPort";
export type { StoragePort, CachedFile } from "./StoragePort";
export type { NotifierPort, StartVaultEventStreamOptions } from "./NotifierPort";
export type { MediaCachePort } from "./MediaCachePort";
export type { ApiFetchPort } from "./ApiFetchPort";
