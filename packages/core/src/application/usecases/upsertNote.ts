import type { Note } from "../../domain/entities/note";
import type { ClockPort } from "../ports/out/ClockPort";

/** Fields a caller may supply when creating or updating a note. */
export type UpsertNoteCommand = Partial<Note> & { id?: string; title: string; body: string };

export interface UpsertNotePorts {
  clock: ClockPort;
  /** Pure path builder for a note (domain helper), injected by the caller. */
  resolvePath: (note: Pick<Note, "id" | "body" | "folder"> & { title?: string }) => string;
  /** Whether new items must be born encrypted (vault policy), resolved by the caller. */
  encryptionRequired: boolean;
}

/**
 * Build the note write-model for an upsert: merge the incoming command over any
 * existing note, filling defaults. Pure — the caller resolves the id (so it can
 * look up `existing`), supplies the clock + path builder + encryption policy, and
 * owns persistence. Behavior mirrors the previous inline store logic exactly.
 *
 * `encrypted` is sticky: once set it survives a sync-down so a hydration can't
 * flip a locally-encrypted note back to plaintext. `createdAt` is preserved from
 * the existing note; `updatedAt` always advances.
 */
// eslint-disable-next-line complexity -- an 11-field merge with per-field (command ?? existing ?? default) fallbacks; each field is one branch, cohesive and not worth fragmenting
export function resolveUpsertedNote(
  id: string,
  command: UpsertNoteCommand,
  existing: Note | undefined,
  ports: UpsertNotePorts,
): Note {
  const timestamp = ports.clock.nowIso();
  const folder = command.folder ?? existing?.folder ?? null;
  const path =
    command.path ??
    existing?.path ??
    ports.resolvePath({ id, body: command.body, folder, title: command.title });
  const encrypted = command.encrypted ?? existing?.encrypted ?? ports.encryptionRequired;
  return {
    id,
    path,
    title: command.title,
    body: command.body,
    frontmatter: command.frontmatter ?? existing?.frontmatter ?? {},
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    folder,
    tags: command.tags ?? existing?.tags ?? [],
    encrypted,
    format: command.format ?? existing?.format,
  };
}
