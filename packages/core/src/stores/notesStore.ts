import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { Note } from "../types/note";
import { notePathFor } from "../lib/file-paths";
import {
  journalDefaultBody,
  journalPathFor,
  journalYMDFromPath,
} from "../lib/journal";

interface JournalDraft {
  /** YMD date the draft represents, e.g. "2026-05-16" */
  date: string;
  /** Initial body the buffer was seeded with. Materialization triggers on divergence. */
  defaultBody: string;
  /** Live body as the user types. */
  body: string;
}

interface NotesState {
  notes: Record<string, Note>;
  folders: string[];
  activeNoteId: string | null;
  /** In-memory daily-note buffer. No file is written until the body diverges from defaultBody. */
  draftJournal: JournalDraft | null;
  setActive(id: string | null): void;
  upsert(note: Partial<Note> & { id?: string; title: string; body: string }): Note;
  updateBody(id: string, body: string): void;
  setRemotePath(id: string, path: string): void;
  setFolder(id: string, folder: string | null): void;
  createFolder(path: string): void;
  removeFolder(path: string): void;
  remove(id: string): void;
  replaceAll(notes: Note[]): void;
  all(): Note[];
  findJournalByDate(ymd: string): Note | null;
  /** Open a daily note. Existing → setActive. Missing → seed an in-memory draft. */
  openJournal(ymd: string): void;
  /** Editor onChange for journal mode. Materializes the draft on first divergence. */
  updateJournalDraftBody(body: string): void;
  /** Discard the in-memory draft without writing anything. */
  discardJournalDraft(): void;
}

function cleanFolder(folder: string | null): string | null {
  if (folder === null) return null;
  const parts = folder
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts.join("/") : null;
}

const now = () => new Date().toISOString();

export const useNotesStore = create<NotesState>()(
  persist(
    immer<NotesState>((set, get) => ({
    notes: {},
    folders: [],
    activeNoteId: null,
    draftJournal: null,

    setActive(id) {
      set((state) => {
        state.activeNoteId = id;
        // Switching to another note discards any pending journal draft.
        state.draftJournal = null;
      });
    },

    upsert(input) {
      const id = input.id ?? nanoid(12);
      const existing = get().notes[id];
      const timestamp = now();
      const folder = input.folder ?? existing?.folder ?? null;
      const path =
        input.path ??
        existing?.path ??
        notePathFor({ id, body: input.body, folder, title: input.title });
      const note: Note = {
        id,
        path,
        title: input.title,
        body: input.body,
        frontmatter: input.frontmatter ?? existing?.frontmatter ?? {},
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        folder,
        tags: input.tags ?? existing?.tags ?? [],
      };
      set((state) => {
        state.notes[id] = note;
        if (!state.activeNoteId) state.activeNoteId = id;
      });
      return note;
    },

    updateBody(id, body) {
      set((state) => {
        const note = state.notes[id];
        if (!note) return;
        note.body = body;
        note.updatedAt = now();
      });
    },

    setRemotePath(id, path) {
      set((state) => {
        const note = state.notes[id];
        if (!note) return;
        note.path = path;
      });
    },

    setFolder(id, folder) {
      set((state) => {
        const note = state.notes[id];
        if (!note) return;
        note.folder = cleanFolder(folder);
        note.updatedAt = now();
      });
    },

    createFolder(path) {
      const cleaned = cleanFolder(path);
      if (!cleaned) return;
      set((state) => {
        if (!state.folders.includes(cleaned)) state.folders.push(cleaned);
      });
    },

    removeFolder(path) {
      const cleaned = cleanFolder(path);
      if (!cleaned) return;
      set((state) => {
        state.folders = state.folders.filter((p) => p !== cleaned);
      });
    },

    remove(id) {
      set((state) => {
        delete state.notes[id];
        if (state.activeNoteId === id) state.activeNoteId = null;
      });
    },

    replaceAll(notes) {
      set((state) => {
        state.notes = {};
        for (const n of notes) state.notes[n.id] = n;
        if (state.activeNoteId && !state.notes[state.activeNoteId]) {
          state.activeNoteId = null;
        }
      });
    },

    all() {
      return Object.values(get().notes).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
    },

    findJournalByDate(ymd) {
      const path = journalPathFor(ymd);
      for (const n of Object.values(get().notes)) {
        if (n.path === path) return n;
        if (journalYMDFromPath(n.path) === ymd) return n;
      }
      return null;
    },

    openJournal(ymd) {
      const existing = get().findJournalByDate(ymd);
      if (existing) {
        set((state) => {
          state.activeNoteId = existing.id;
          state.draftJournal = null;
        });
        return;
      }
      const defaultBody = journalDefaultBody(ymd);
      set((state) => {
        state.activeNoteId = null;
        state.draftJournal = { date: ymd, defaultBody, body: defaultBody };
      });
    },

    updateJournalDraftBody(body) {
      const draft = get().draftJournal;
      if (!draft) return;
      if (body === draft.defaultBody) {
        set((state) => {
          if (state.draftJournal) state.draftJournal.body = body;
        });
        return;
      }
      // First divergence — materialize the draft as a real note on the journal path.
      const id = nanoid(12);
      const timestamp = now();
      const note: Note = {
        id,
        path: journalPathFor(draft.date),
        title: "",
        body,
        frontmatter: {},
        createdAt: timestamp,
        updatedAt: timestamp,
        folder: null,
        tags: [],
      };
      set((state) => {
        state.notes[id] = note;
        state.activeNoteId = id;
        state.draftJournal = null;
      });
    },

    discardJournalDraft() {
      set((state) => {
        state.draftJournal = null;
      });
    },
  })),
    {
      name: "notekit:notes",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        notes: state.notes,
        folders: state.folders,
        activeNoteId: state.activeNoteId,
      }),
      version: 1,
    },
  ),
);
