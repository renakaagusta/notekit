import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { SavedLink } from "../types/link";
import { linkPathFor, sanitizeFolderPath } from "../lib/file-paths";
import { detectPlatform } from "../lib/link-platform";
import { detectLinkKind } from "../lib/link-kind";
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
        const timestamp = now();
        const title = input.title?.trim() || existing?.title || titleFromUrl(input.url);
        const platform = input.platform ?? existing?.platform ?? detectPlatform(input.url);
        // Auto-classify image/pdf from the URL unless the caller is explicit
        // or we already classified this item before.
        const kind = input.kind ?? existing?.kind ?? detectLinkKind(input.url);
        const folder =
          input.folder !== undefined
            ? cleanFolder(input.folder)
            : existing?.folder ?? null;
        const path =
          input.path ?? existing?.path ?? linkPathFor({ id, title, folder });

        const link: SavedLink = {
          id,
          path,
          url: input.url,
          title,
          description: input.description ?? existing?.description ?? null,
          platform,
          kind,
          tags: input.tags ?? existing?.tags ?? [],
          folder,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
          encrypted:
            input.encrypted ??
            existing?.encrypted ??
            useCryptoStore.getState().encryptionRequired,
        };
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
      name: "notekit:links",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ links: state.links, folders: state.folders }),
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
    },
  ),
);
