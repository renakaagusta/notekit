import type { Ticket } from "../../domain/entities/ticket";
import { deriveTicketKey } from "../../domain/ticket-key";
import type { ClockPort } from "../ports/out/ClockPort";

/** Fields a caller may supply when creating or updating a ticket. */
export type UpsertTicketCommand = Partial<Ticket> & { title: string };

export interface UpsertTicketPorts {
  clock: ClockPort;
  /** Pure path builder for a ticket (domain helper), injected by the caller. */
  resolvePath: (ticket: Pick<Ticket, "id" | "title">) => string;
  /** Whether new items must be born encrypted (vault policy), resolved by the caller. */
  encryptionRequired: boolean;
  /** Creator to stamp on new tickets (e.g. `user:<owner>`), resolved by the caller. */
  defaultCreator: string | null;
  /**
   * Keys already taken by OTHER tickets in the vault, for uniqueness when
   * deriving/renaming this ticket's human-friendly key. Excludes this ticket's
   * own key so a title edit doesn't churn a stable key.
   */
  existingKeys: Iterable<string>;
}

/**
 * Resolve the human-friendly key for an upsert. An explicit `command.key` is a
 * rename (slugged + de-duped against other tickets). Otherwise keep a ticket's
 * existing key, and derive a fresh one only when it has none (create/backfill).
 */
function resolveTicketKey(
  command: UpsertTicketCommand,
  existing: Ticket | undefined,
  existingKeys: Iterable<string>,
): string {
  if (command.key !== undefined) {
    return deriveTicketKey(command.title, existingKeys, command.key);
  }
  return existing?.key ?? deriveTicketKey(command.title, existingKeys);
}

/**
 * Build the ticket write-model for an upsert: merge the incoming command over any
 * existing ticket, filling defaults. Pure — the caller resolves the id, supplies
 * the clock + path builder + encryption policy + default creator, and owns
 * persistence. Behavior mirrors the previous inline store logic exactly.
 */
// eslint-disable-next-line complexity -- a 14-field merge with per-field (command ?? existing ?? default) fallbacks; each field is one branch, cohesive and not worth fragmenting
export function resolveUpsertedTicket(
  id: string,
  command: UpsertTicketCommand,
  existing: Ticket | undefined,
  ports: UpsertTicketPorts,
): Ticket {
  const timestamp = ports.clock.nowIso();
  return {
    id,
    key: resolveTicketKey(command, existing, ports.existingKeys),
    path: command.path ?? existing?.path ?? ports.resolvePath({ id, title: command.title }),
    title: command.title,
    body: command.body ?? existing?.body ?? "",
    status: command.status ?? existing?.status ?? "todo",
    priority: command.priority ?? existing?.priority ?? "medium",
    assignee: command.assignee ?? existing?.assignee ?? null,
    labels: command.labels ?? existing?.labels ?? [],
    linkedNotes: command.linkedNotes ?? existing?.linkedNotes ?? [],
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    dueDate: command.dueDate ?? existing?.dueDate ?? null,
    createdBy: command.createdBy ?? existing?.createdBy ?? ports.defaultCreator,
    encrypted: command.encrypted ?? existing?.encrypted ?? ports.encryptionRequired,
  };
}
