import type { Ticket } from "../../domain/entities/ticket";
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
