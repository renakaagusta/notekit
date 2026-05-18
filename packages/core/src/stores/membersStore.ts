import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import * as vault from "../lib/vault-api";
import {
  MEMBERS_PATH,
  flattenMembers,
  parseMembersFile,
} from "../lib/members";
import type { Member, MembersFile } from "../types/member";

type LoadStatus = "idle" | "loading" | "ready" | "missing" | "error";

interface MembersState {
  status: LoadStatus;
  file: MembersFile;
  members: Member[];
  error: string | null;
  load(): Promise<void>;
  reset(): void;
}

const EMPTY: MembersFile = { users: [], agents: [] };

export const useMembersStore = create<MembersState>()(
  immer<MembersState>((set, get) => ({
    status: "idle",
    file: EMPTY,
    members: [],
    error: null,

    async load() {
      if (get().status === "loading") return;
      set((state) => {
        state.status = "loading";
        state.error = null;
      });
      try {
        const res = await vault.readFile(MEMBERS_PATH);
        // Treat absent/empty file the same as 404: the user hasn't set members
        // up yet, so the picker should hint at the path instead of saying
        // "no matches" as if the search came up dry.
        if (!res.content || res.content.trim() === "") {
          set((state) => {
            state.file = EMPTY;
            state.members = [];
            state.status = "missing";
          });
          return;
        }
        const file = parseMembersFile(res.content);
        set((state) => {
          state.file = file;
          state.members = flattenMembers(file);
          state.status = "ready";
        });
      } catch (e) {
        const msg = (e as Error).message;
        // 404 is the normal "no members file yet" case — surface as `missing`
        // so the UI can prompt the user to create one without sounding alarmed.
        if (msg.includes("404")) {
          set((state) => {
            state.file = EMPTY;
            state.members = [];
            state.status = "missing";
          });
          return;
        }
        set((state) => {
          state.status = "error";
          state.error = msg;
        });
      }
    },

    reset() {
      set((state) => {
        state.status = "idle";
        state.file = EMPTY;
        state.members = [];
        state.error = null;
      });
    },
  })),
);
