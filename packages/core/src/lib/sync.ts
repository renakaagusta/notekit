/**
 * Sync orchestrator: pulls vault state from GitHub on start, then pushes
 * debounced writes on local changes. Last-write-wins for now — a proper
 * conflict UI is a later milestone.
 */
import * as vault from "./vault-api";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { useSyncStore } from "../stores/syncStore";
import { useMembersStore } from "../stores/membersStore";
import {
  serializeNote,
  serializeTicket,
  deserializeNote,
  deserializeTicket,
} from "./serialize";
import { notePathFor, ticketPathFor } from "./file-paths";
import { noteTitle } from "./note-display";
import { journalYMDFromPath } from "./journal";
import type { Note } from "../types/note";
import type { Ticket } from "../types/ticket";

const DEBOUNCE_MS = 1500;

// Path → sha cache, so PUTs include the previous sha when known.
const shaCache = new Map<string, string>();

type Pending =
  | {
      kind: "note";
      id: string;
      deletedPath?: string;
      deletedTitle?: string;
    }
  | {
      kind: "ticket";
      id: string;
      deletedPath?: string;
      deletedTitle?: string;
      prevStatus?: string;
    };
const pending: Pending[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let started = false;

function enqueue(p: Pending) {
  // Coalesce: keep only the latest of each (kind,id).
  const idx = pending.findIndex((x) => x.kind === p.kind && x.id === p.id);
  if (idx >= 0) pending.splice(idx, 1);
  pending.push(p);
  useSyncStore.getState().setPending(pending.length);
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    void flush();
  }, DEBOUNCE_MS);
}

function quote(s: string): string {
  const t = (s || "Untitled").replace(/"/g, '\\"');
  return `"${t}"`;
}

function noteMessage(
  action: "create" | "update" | "rename" | "move" | "moverename" | "delete",
  title: string,
  toFolder?: string | null,
): string {
  const folderLabel = toFolder ? `/${toFolder}` : " root";
  switch (action) {
    case "create":
      return `Create note ${quote(title)}`;
    case "update":
      return `Update note ${quote(title)}`;
    case "rename":
      return `Rename note → ${quote(title)}`;
    case "move":
      return `Move note ${quote(title)} →${folderLabel}`;
    case "moverename":
      return `Move and rename note → ${quote(title)} (${folderLabel.trim()})`;
    case "delete":
      return `Delete note ${quote(title)}`;
  }
}

function splitNotePath(p: string): { folder: string; file: string } {
  const stripped = p.replace(/^notes\//, "");
  const lastSlash = stripped.lastIndexOf("/");
  if (lastSlash < 0) return { folder: "", file: stripped };
  return {
    folder: stripped.slice(0, lastSlash),
    file: stripped.slice(lastSlash + 1),
  };
}

function ticketMessage(
  action: "create" | "update" | "rename" | "delete" | "move",
  title: string,
  status?: string,
): string {
  switch (action) {
    case "create":
      return `Create ticket ${quote(title)}`;
    case "update":
      return `Update ticket ${quote(title)}`;
    case "rename":
      return `Rename ticket → ${quote(title)}`;
    case "delete":
      return `Delete ticket ${quote(title)}`;
    case "move":
      return `Move ticket ${quote(title)} → ${status ?? "?"}`;
  }
}

function ticketChanged(a: Ticket, b: Ticket): boolean {
  return (
    a.body !== b.body ||
    a.title !== b.title ||
    a.status !== b.status ||
    a.priority !== b.priority ||
    a.assignee !== b.assignee ||
    a.dueDate !== b.dueDate ||
    a.labels.join("\u0000") !== b.labels.join("\u0000") ||
    a.linkedNotes.join("\u0000") !== b.linkedNotes.join("\u0000")
  );
}

async function flush() {
  if (flushing || pending.length === 0) return;
  flushing = true;
  useSyncStore.getState().setPhase("pushing");

  try {
    while (pending.length > 0) {
      const item = pending.shift()!;
      useSyncStore.getState().setPending(pending.length);

      if (item.kind === "note") {
        await flushNote(item);
      } else {
        await flushTicket(item);
      }
    }
    useSyncStore.getState().markSynced();
  } catch (e) {
    console.error("[sync] flush failed", e);
    useSyncStore.getState().setError((e as Error).message);
  } finally {
    flushing = false;
  }
}

async function flushNote(item: Extract<Pending, { kind: "note" }>) {
  const note = useNotesStore.getState().notes[item.id];

  if (!note) {
    // Local deletion — best-effort remote delete.
    const path = item.deletedPath;
    if (!path) return;
    const sha = shaCache.get(path);
    if (!sha) return;
    try {
      await vault.deleteFile(path, sha, noteMessage("delete", item.deletedTitle ?? ""));
      shaCache.delete(path);
    } catch (e) {
      console.warn("[sync] delete note failed", e);
    }
    return;
  }

  // Journal notes live at a path encoded by their date; never auto-rename them.
  const isJournal = journalYMDFromPath(note.path) !== null;
  const desired = isJournal ? note.path : notePathFor(note);
  const current = note.path;
  const title = noteTitle(note);
  const body = serializeNote(note);

  if (current !== desired) {
    const a = splitNotePath(current);
    const b = splitNotePath(desired);
    const folderChanged = a.folder !== b.folder;
    const fileChanged = a.file !== b.file;
    const action: "move" | "rename" | "moverename" =
      folderChanged && fileChanged
        ? "moverename"
        : folderChanged
          ? "move"
          : "rename";
    const cleanupLabel = action === "move" ? "Move" : "Rename";

    const writeRes = await vault.writeFile(
      desired,
      body,
      noteMessage(action, title, b.folder || null),
      shaCache.get(desired),
    );
    shaCache.set(desired, writeRes.sha);

    const oldSha = shaCache.get(current);
    if (oldSha) {
      try {
        await vault.deleteFile(
          current,
          oldSha,
          `${cleanupLabel} cleanup: remove ${current}`,
        );
        shaCache.delete(current);
      } catch (e) {
        console.warn("[sync] failed to remove old path after rename", current, e);
      }
    }
    useNotesStore.getState().setRemotePath(item.id, desired);
    return;
  }

  const prevSha = shaCache.get(current);
  const result = await vault.writeFile(
    current,
    body,
    noteMessage(prevSha ? "update" : "create", title),
    prevSha,
  );
  shaCache.set(current, result.sha);
}

async function flushTicket(item: Extract<Pending, { kind: "ticket" }>) {
  const ticket = useTicketsStore.getState().tickets[item.id];

  if (!ticket) {
    const path = item.deletedPath;
    if (!path) return;
    const sha = shaCache.get(path);
    if (!sha) return;
    try {
      await vault.deleteFile(
        path,
        sha,
        ticketMessage("delete", item.deletedTitle ?? ""),
      );
      shaCache.delete(path);
    } catch (e) {
      console.warn("[sync] delete ticket failed", e);
    }
    return;
  }

  const desired = ticketPathFor(ticket);
  const current = ticket.path;
  const title = ticket.title;
  const body = serializeTicket(ticket);

  if (current !== desired) {
    const writeRes = await vault.writeFile(
      desired,
      body,
      ticketMessage("rename", title),
      shaCache.get(desired),
    );
    shaCache.set(desired, writeRes.sha);

    const oldSha = shaCache.get(current);
    if (oldSha) {
      try {
        await vault.deleteFile(
          current,
          oldSha,
          `Rename cleanup: remove ${current}`,
        );
        shaCache.delete(current);
      } catch (e) {
        console.warn(
          "[sync] failed to remove old ticket path after rename",
          current,
          e,
        );
      }
    }
    useTicketsStore.getState().setRemotePath(item.id, desired);
    return;
  }

  const prevSha = shaCache.get(current);
  let action: "create" | "update" | "move" = prevSha ? "update" : "create";
  if (
    prevSha &&
    item.prevStatus &&
    item.prevStatus !== ticket.status
  ) {
    action = "move";
  }
  const result = await vault.writeFile(
    current,
    body,
    ticketMessage(action, title, ticket.status),
    prevSha,
  );
  shaCache.set(current, result.sha);
}

async function pullAll(): Promise<{ notes: Note[]; tickets: Ticket[] }> {
  const [noteList, ticketList, journalList] = await Promise.all([
    vault.listFiles("notes/"),
    vault.listFiles("tickets/"),
    vault.listFiles("journal/"),
  ]);

  const notes: Note[] = [];
  for (const entry of [...noteList.entries, ...journalList.entries]) {
    if (!entry.path.endsWith(".md")) continue;
    const file = await vault.readFile(entry.path);
    if (file.sha) shaCache.set(file.path, file.sha);
    if (typeof file.content !== "string") continue;
    const note = deserializeNote(file.path, file.content);
    if (note) notes.push(note);
  }

  const tickets: Ticket[] = [];
  for (const entry of ticketList.entries) {
    if (!entry.path.endsWith(".md")) continue;
    const file = await vault.readFile(entry.path);
    if (file.sha) shaCache.set(file.path, file.sha);
    if (typeof file.content !== "string") continue;
    const ticket = deserializeTicket(file.path, file.content);
    if (ticket) tickets.push(ticket);
  }

  return { notes, tickets };
}

export async function pull(): Promise<void> {
  useSyncStore.getState().setPhase("fetching");
  try {
    const { notes, tickets } = await pullAll();
    if (notes.length > 0) useNotesStore.getState().replaceAll(notes);
    if (tickets.length > 0) useTicketsStore.getState().replaceAll(tickets);
    // Best-effort: members file is optional. Failures don't block the pull.
    void useMembersStore.getState().load();
    useSyncStore.getState().markSynced();
  } catch (e) {
    console.error("[sync] pull failed", e);
    useSyncStore.getState().setError((e as Error).message);
  }
}

/**
 * Start the sync engine: pull once, then subscribe to store changes.
 * Idempotent — safe to call multiple times.
 */
export async function start(): Promise<void> {
  if (started) return;
  started = true;

  await pull();

  // Track per-id snapshots so we only enqueue when content actually changes.
  let lastNotes: Record<string, Note> = { ...useNotesStore.getState().notes };
  let lastTickets: Record<string, Ticket> = {
    ...useTicketsStore.getState().tickets,
  };

  useNotesStore.subscribe((state) => {
    const next = state.notes;
    for (const id of Object.keys(next)) {
      const a = lastNotes[id];
      const b = next[id]!;
      if (
        !a ||
        a.body !== b.body ||
        a.title !== b.title ||
        a.folder !== b.folder ||
        a.tags.join(",") !== b.tags.join(",")
      ) {
        enqueue({ kind: "note", id });
      }
    }
    for (const id of Object.keys(lastNotes)) {
      if (!next[id]) {
        const old = lastNotes[id]!;
        enqueue({
          kind: "note",
          id,
          deletedPath: old.path,
          deletedTitle: noteTitle(old),
        });
      }
    }
    lastNotes = { ...next };
  });

  useTicketsStore.subscribe((state) => {
    const next = state.tickets;
    for (const id of Object.keys(next)) {
      const a = lastTickets[id];
      const b = next[id]!;
      if (!a || ticketChanged(a, b)) {
        enqueue({
          kind: "ticket",
          id,
          prevStatus: a?.status,
        });
      }
    }
    for (const id of Object.keys(lastTickets)) {
      if (!next[id]) {
        const old = lastTickets[id]!;
        enqueue({
          kind: "ticket",
          id,
          deletedPath: old.path,
          deletedTitle: old.title,
        });
      }
    }
    lastTickets = { ...next };
  });
}

export function stop(): void {
  started = false;
  if (flushTimer) clearTimeout(flushTimer);
}

/**
 * Tear the engine down so a subsequent `start()` re-pulls from a different
 * remote. Drops the in-flight queue, the sha cache, and any pending flush
 * timer. Caller is responsible for clearing in-memory stores before the
 * next start so we don't push stale state to the new remote.
 */
export function reset(): void {
  started = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  pending.length = 0;
  shaCache.clear();
  flushing = false;
  useSyncStore.getState().setPending(0);
}
