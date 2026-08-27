/**
 * Parent/child relationships between tickets. A subtask is a regular ticket
 * whose {@link Ticket.parentId} points at its parent's immutable `id`. These
 * helpers are pure and dependency-free — the hierarchy is derived from a flat
 * ticket list, never stored as a separate structure.
 */
import type { Ticket, TicketStatus } from "./entities/ticket";

const COMPLETE_STATUSES: ReadonlySet<TicketStatus> = new Set<TicketStatus>([
  "done",
  "archived",
]);

/** Direct children of a parent, in the given list's order. */
export function childrenOf(parentId: string, tickets: Iterable<Ticket>): Ticket[] {
  const out: Ticket[] = [];
  for (const t of tickets) {
    if (t.parentId === parentId) out.push(t);
  }
  return out;
}

/** Tickets with no parent — the top level of the board. */
export function topLevelTickets(tickets: Iterable<Ticket>): Ticket[] {
  const out: Ticket[] = [];
  for (const t of tickets) {
    if (!t.parentId) out.push(t);
  }
  return out;
}

/**
 * Every descendant id of `rootId` (children, grandchildren, …), excluding the
 * root itself. Cycle-safe: a ticket is never visited twice.
 */
export function descendantIds(rootId: string, tickets: Iterable<Ticket>): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const t of tickets) {
    if (!t.parentId) continue;
    const siblings = byParent.get(t.parentId);
    if (siblings) siblings.push(t.id);
    else byParent.set(t.parentId, [t.id]);
  }
  const seen = new Set<string>();
  const queue = [...(byParent.get(rootId) ?? [])];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of byParent.get(id) ?? []) queue.push(child);
  }
  return seen;
}

/**
 * Whether `childId` may be reparented under `newParentId`. Rejects the two
 * cycle-forming cases: making a ticket its own parent, or moving it under one of
 * its own descendants.
 */
export function canReparent(
  childId: string,
  newParentId: string,
  tickets: Iterable<Ticket>,
): boolean {
  if (childId === newParentId) return false;
  return !descendantIds(childId, tickets).has(newParentId);
}

export interface ChildProgress {
  done: number;
  total: number;
}

/** Completion over a ticket's DIRECT children (done/archived count as done). */
export function childProgress(parentId: string, tickets: Iterable<Ticket>): ChildProgress {
  const children = childrenOf(parentId, tickets);
  return {
    done: children.filter((c) => COMPLETE_STATUSES.has(c.status)).length,
    total: children.length,
  };
}
