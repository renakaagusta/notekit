import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { ticketPathFor } from "../lib/file-paths";
import type { Ticket, TicketStatus } from "../types/ticket";
import { useCryptoStore } from "./cryptoStore";
import { useVaultStore } from "./vaultStore";

interface TicketsState {
  tickets: Record<string, Ticket>;
  upsert(input: Partial<Ticket> & { title: string }): Ticket;
  setStatus(id: string, status: TicketStatus): void;
  setAssignee(id: string, assignee: string | null): void;
  setDueDate(id: string, dueDate: string | null): void;
  setRemotePath(id: string, path: string): void;
  /**
   * Flip the encryption flag on a ticket. The board keeps rendering the
   * card after the flip because status/priority/dueDate remain in
   * plaintext frontmatter. The sync layer writes to the new path on
   * its next flush; Git history of pre-encryption versions persists.
   */
  toggleEncrypted(id: string): void;
  remove(id: string): void;
  replaceAll(tickets: Ticket[]): void;
  byStatus(status: TicketStatus): Ticket[];
  all(): Ticket[];
}

const now = () => new Date().toISOString();

export const useTicketsStore = create<TicketsState>()(
  persist(
    // eslint-disable-next-line max-lines-per-function -- store factory defines all state methods together
    immer<TicketsState>((set, get) => ({
    tickets: {},

    // eslint-disable-next-line complexity -- ticket upsert merges existing+incoming fields requiring multiple conditional branches
    upsert(input) {
      const id = input.id ?? nanoid(12);
      const existing = get().tickets[id];
      const timestamp = now();
      const path =
        input.path ??
        existing?.path ??
        ticketPathFor({ id, title: input.title });
      const owner = useVaultStore.getState().vault?.owner;
      const defaultCreator = owner ? `user:${owner}` : null;
      const ticket: Ticket = {
        id,
        path,
        title: input.title,
        body: input.body ?? existing?.body ?? "",
        status: input.status ?? existing?.status ?? "todo",
        priority: input.priority ?? existing?.priority ?? "medium",
        assignee: input.assignee ?? existing?.assignee ?? null,
        labels: input.labels ?? existing?.labels ?? [],
        linkedNotes: input.linkedNotes ?? existing?.linkedNotes ?? [],
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        dueDate: input.dueDate ?? existing?.dueDate ?? null,
        createdBy: input.createdBy ?? existing?.createdBy ?? defaultCreator,
        encrypted:
          input.encrypted ??
          existing?.encrypted ??
          useCryptoStore.getState().encryptionRequired,
      };
      set((state) => {
        state.tickets[id] = ticket;
      });
      return ticket;
    },

    setStatus(id, status) {
      set((state) => {
        const ticket = state.tickets[id];
        if (!ticket) return;
        ticket.status = status;
        ticket.updatedAt = now();
      });
    },

    setAssignee(id, assignee) {
      set((state) => {
        const ticket = state.tickets[id];
        if (!ticket) return;
        ticket.assignee = assignee;
        ticket.updatedAt = now();
      });
    },

    setDueDate(id, dueDate) {
      set((state) => {
        const ticket = state.tickets[id];
        if (!ticket) return;
        ticket.dueDate = dueDate;
        ticket.updatedAt = now();
      });
    },

    setRemotePath(id, path) {
      set((state) => {
        const ticket = state.tickets[id];
        if (!ticket) return;
        ticket.path = path;
      });
    },

    toggleEncrypted(id) {
      set((state) => {
        const ticket = state.tickets[id];
        if (!ticket) return;
        ticket.encrypted = !ticket.encrypted;
        ticket.updatedAt = now();
      });
    },

    remove(id) {
      set((state) => {
        const { [id]: _, ...rest } = state.tickets;
        state.tickets = rest;
      });
    },

    replaceAll(tickets) {
      set((state) => {
        state.tickets = {};
        for (const t of tickets) state.tickets[t.id] = t;
      });
    },

    byStatus(status) {
      return Object.values(get().tickets).filter((t) => t.status === status);
    },

    all() {
      return Object.values(get().tickets);
    },
  })),
    {
      // Default name + noop storage are placeholders until
      // bindVaultPersistence() rebinds them to a vault-scoped slot in
      // localStorage. See packages/core/src/lib/vault-persistence.ts.
      name: "notekit:tickets:__unbound",
      storage: createJSONStorage(() => ({
        getItem: () => null,
        setItem: () => { /* intentional noop */ },
        removeItem: () => { /* intentional noop */ },
      })),
      partialize: (state) => ({
        // Strip decrypted content — title and body are the sensitive payload
        // and must never reach localStorage for encrypted tickets. Persist
        // empty-string placeholders (not `undefined`) so a ticket rehydrated
        // before its E2EE content decrypts still satisfies the `Ticket` shape.
        tickets: Object.fromEntries(
          Object.entries(state.tickets).map(([id, { title: _title, body: _body, ...safe }]) => [
            id,
            { ...safe, title: "", body: "" },
          ]),
        ),
      }),
      // Backfill title/body on rehydrate for older persisted payloads that
      // stripped them to `undefined` (see notesStore for rationale).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TicketsState>;
        const tickets: Record<string, Ticket> = {};
        for (const [id, t] of Object.entries(p.tickets ?? {})) {
          tickets[id] = { ...t, title: t.title ?? "", body: t.body ?? "" };
        }
        return { ...current, ...p, tickets };
      },
      version: 1,
      skipHydration: true,
    },
  ),
);
