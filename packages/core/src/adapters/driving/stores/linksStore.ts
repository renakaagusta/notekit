import { nanoid } from "nanoid";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { resolveUpsertedLink } from "../../../application/usecases/upsertLink";
import type { SavedLink } from "../../../domain/entities/link";
import { linkPathFor, sanitizeFolderPath } from "../../../domain/file-paths";
import { detectLinkKind } from "../../../domain/link-kind";
import { detectPlatform } from "../../../domain/link-platform";
import { useCryptoStore } from "./cryptoStore";

interface LinksState {
  links: Record<string, SavedLink>;
  /**
   * Folder paths that exist independently of any link — lets users
   * create an empty folder and stage links into it later. Mirrors the
   * `folders` list on the notes store.
   */
  folders: string[];
  upsert(input: Partial<SavedLink> & { url: string }): SavedLink;
  /**
   * Flip the encryption flag on a saved link. When set, the URL itself
   * — the most sensitive field — moves into the ciphertext on the next
   * sync. Plaintext list rows for encrypted links show only the
   * timestamp until unlocked.
   */
  toggleEncrypted(id: string): void;
  /** Move a link to another folder, or to the vault root (`null`). */
  setFolder(id: string, folder: string | null): void;
  /** Set (or clear) the ink annotation drawn over a media item (#32). */
  setAnnotation(id: string, annotation: SavedLink["annotation"]): void;
  createFolder(path: string): void;
  removeFolder(path: string): void;
  remove(id: string): void;
  replaceAll(links: SavedLink[]): void;
  all(): SavedLink[];
}

const now = () => new Date().toISOString();

function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 60);
  }
}

function cleanFolder(folder: string | null | undefined): string | null {
  return sanitizeFolderPath(folder ?? null);
}

export const useLinksStore = create<LinksState>()(
  persist(
    immer<LinksState>((set, get) => ({
      links: {},
      folders: [],

      upsert(input) {
        const id = input.id ?? nanoid(12);
        const existing = get().links[id];
        const link = resolveUpsertedLink(id, input, existing, {
          clock: { now: () => Date.now(), nowIso: now },
          resolvePath: linkPathFor,
          deriveTitle: titleFromUrl,
          detectPlatform,
          detectLinkKind,
          cleanFolder,
          encryptionRequired: useCryptoStore.getState().encryptionRequired,
        });
        set((state) => {
          state.links[id] = link;
        });
        return link;
      },

      toggleEncrypted(id) {
        set((state) => {
          const link = state.links[id];
          if (!link) return;
          link.encrypted = !link.encrypted;
          link.updatedAt = now();
        });
      },

      setAnnotation(id, annotation) {
        set((state) => {
          const link = state.links[id];
          if (!link) return;
          link.annotation = annotation ?? null;
          link.updatedAt = now();
        });
      },

      setFolder(id, folder) {
        set((state) => {
          const link = state.links[id];
          if (!link) return;
          link.folder = cleanFolder(folder);
          link.updatedAt = now();
          // Let the sync layer recompute the on-disk path on next flush;
          // matches notesStore.setFolder().
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
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- immer draft requires dynamic delete to remove a record key
          delete state.links[id];
        });
      },

      replaceAll(links) {
        set((state) => {
          state.links = {};
          for (const l of links) state.links[l.id] = l;
        });
      },

      all() {
        return Object.values(get().links).sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      },
    })),
    {
      // Default name + noop storage are placeholders until
      // bindVaultPersistence() rebinds them to a vault-scoped slot in
      // localStorage. See packages/core/src/lib/vault-persistence.ts.
      name: "notekit:links:__unbound",
      storage: createJSONStorage(() => ({
        getItem: () => null,
        setItem: () => { /* intentional noop */ },
        removeItem: () => { /* intentional noop */ },
      })),
      partialize: (state) => ({
        // Strip decrypted content — url, title, and description are the sensitive payload
        // and must never reach localStorage for encrypted links. Persist
        // empty-string placeholders (not `undefined`) so a link rehydrated
        // before its E2EE content decrypts still satisfies the `SavedLink` shape.
        links: Object.fromEntries(
          Object.entries(state.links).map(([id, { url: _url, title: _title, description: _description, ...safe }]) => [
            id,
            { ...safe, url: "", title: "", description: "" },
          ]),
        ),
        folders: state.folders,
      }),
      version: 2,
      migrate: (persisted: unknown, version) => {
        if (!persisted || typeof persisted !== "object") return persisted;
        // v1 → v2: backfill `folder: null` on every persisted link and seed
        // an empty `folders` list. Without the backfill, the new tree view
        // would treat undefined as "no folder field" rather than "root".
        if (version < 2) {
          const state = persisted as {
            links?: Record<string, SavedLink>;
            folders?: string[];
          };
          if (state.links) {
            for (const link of Object.values(state.links)) {
              if (link.folder === undefined) link.folder = null;
            }
          }
          if (!Array.isArray(state.folders)) state.folders = [];
        }
        return persisted;
      },
      // Backfill url/title/description on rehydrate for older persisted payloads
      // that stripped them to `undefined` (see notesStore for rationale).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LinksState>;
        const links: Record<string, SavedLink> = {};
        for (const [id, l] of Object.entries(p.links ?? {})) {
          links[id] = {
            ...l,
            url: l.url ?? "",
            title: l.title ?? "",
            description: l.description ?? "",
          };
        }
        return { ...current, ...p, links };
      },
      skipHydration: true,
    },
  ),
);
