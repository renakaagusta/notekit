import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { SavedLink } from "../types/link";
import { linkPathFor } from "../lib/file-paths";
import { detectPlatform } from "../lib/link-platform";

interface LinksState {
  links: Record<string, SavedLink>;
  upsert(input: Partial<SavedLink> & { url: string }): SavedLink;
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

export const useLinksStore = create<LinksState>()(
  persist(
    immer<LinksState>((set, get) => ({
      links: {},

      upsert(input) {
        const id = input.id ?? nanoid(12);
        const existing = get().links[id];
        const timestamp = now();
        const title = input.title?.trim() || existing?.title || titleFromUrl(input.url);
        const platform = input.platform ?? existing?.platform ?? detectPlatform(input.url);
        const path = input.path ?? existing?.path ?? linkPathFor({ id, title });

        const link: SavedLink = {
          id,
          path,
          url: input.url,
          title,
          description: input.description ?? existing?.description ?? null,
          platform,
          tags: input.tags ?? existing?.tags ?? [],
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        set((state) => {
          state.links[id] = link;
        });
        return link;
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
      partialize: (state) => ({ links: state.links }),
      version: 1,
    },
  ),
);
