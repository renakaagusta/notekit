import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { Ticket, TicketStatus } from "../types/ticket";
import { ticketPathFor } from "../lib/file-paths";

interface TicketsState {
  tickets: Record<string, Ticket>;
  upsert(input: Partial<Ticket> & { title: string }): Ticket;
  setStatus(id: string, status: TicketStatus): void;
  setDueDate(id: string, dueDate: string | null): void;
  setRemotePath(id: string, path: string): void;
  remove(id: string): void;
  replaceAll(tickets: Ticket[]): void;
  byStatus(status: TicketStatus): Ticket[];
  all(): Ticket[];
}

const now = () => new Date().toISOString();

export const useTicketsStore = create<TicketsState>()(
  persist(
    immer<TicketsState>((set, get) => ({
    tickets: {},

    upsert(input) {
      const id = input.id ?? nanoid(12);
      const existing = get().tickets[id];
      const timestamp = now();
      const path =
        input.path ??
        existing?.path ??
        ticketPathFor({ id, title: input.title });
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

    remove(id) {
      set((state) => {
        delete state.tickets[id];
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
      name: "notekit:tickets",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ tickets: state.tickets }),
      version: 1,
    },
  ),
);
