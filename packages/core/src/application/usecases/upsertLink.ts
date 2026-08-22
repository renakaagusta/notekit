import type { LinkKind, SavedLink } from "../../domain/entities/link";
import type { ClockPort } from "../ports/out/ClockPort";

/** Fields a caller may supply when saving or updating a link. */
export type UpsertLinkCommand = Partial<SavedLink> & { url: string };

export interface UpsertLinkPorts {
  clock: ClockPort;
  /** Pure path builder for a link (domain helper), injected by the caller. */
  resolvePath: (link: Pick<SavedLink, "id" | "title" | "folder">) => string;
  /** Derive a display title from a URL when none is given. */
  deriveTitle: (url: string) => string;
  /** Classify the hosting platform from a URL. */
  detectPlatform: (url: string) => string | null;
  /** Auto-classify the link kind (page/image/pdf/…) from a URL. */
  detectLinkKind: (url: string) => LinkKind;
  /** Normalize a folder path (or clear it). */
  cleanFolder: (folder: string | null | undefined) => string | null;
  /** Whether new items must be born encrypted (vault policy), resolved by the caller. */
  encryptionRequired: boolean;
}

/**
 * Build the link write-model for an upsert: merge the incoming command over any
 * existing link, deriving title/platform/kind from the URL when absent. Pure —
 * the caller resolves the id, supplies the clock + URL helpers + path builder +
 * encryption policy, and owns persistence. Behavior mirrors the previous inline
 * store logic exactly (note the `||` title fallback vs `??` elsewhere, and the
 * `folder !== undefined` guard so an explicit null clears the folder).
 */
// eslint-disable-next-line complexity -- a 13-field merge with per-field (command ?? existing ?? derive) fallbacks; each field is one branch, cohesive and not worth fragmenting
export function resolveUpsertedLink(
  id: string,
  command: UpsertLinkCommand,
  existing: SavedLink | undefined,
  ports: UpsertLinkPorts,
): SavedLink {
  const timestamp = ports.clock.nowIso();
  const title = command.title?.trim() || existing?.title || ports.deriveTitle(command.url);
  const platform = command.platform ?? existing?.platform ?? ports.detectPlatform(command.url);
  const kind = command.kind ?? existing?.kind ?? ports.detectLinkKind(command.url);
  const folder =
    command.folder !== undefined ? ports.cleanFolder(command.folder) : existing?.folder ?? null;
  return {
    id,
    path: command.path ?? existing?.path ?? ports.resolvePath({ id, title, folder }),
    url: command.url,
    title,
    description: command.description ?? existing?.description ?? null,
    platform,
    kind,
    annotation: command.annotation ?? existing?.annotation ?? null,
    tags: command.tags ?? existing?.tags ?? [],
    folder,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    encrypted: command.encrypted ?? existing?.encrypted ?? ports.encryptionRequired,
  };
}
