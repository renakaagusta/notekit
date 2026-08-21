import { useEffect } from "react";
import { isValidYMD } from "../lib/journal";
import { noteTitle } from "../lib/note-display";
import { useLayoutStore } from "../stores/layoutStore";
import { useLinksStore } from "../stores/linksStore";
import { useNotesStore } from "../stores/notesStore";
import type { MainView } from "./AppTypes";
import { parseWikilinkTarget } from "./extensions/Wikilink";

interface WikilinkHandlerOptions {
  upsert: (note: { title: string; body: string }) => { id: string };
  setActive: (id: string | null) => void;
  openJournal: (ymd: string) => void;
  openNoteInLayout: (id: string) => void;
  setView: (view: MainView) => void;
}

export function useWikilinkHandler({
  upsert,
  setActive,
  openJournal,
  openNoteInLayout,
  setView,
}: WikilinkHandlerOptions) {
  useEffect(() => {
    function onOpen(e: Event) {
      const raw = (e as CustomEvent<{ target: string }>).detail?.target;
      if (!raw) return;
      const { kind, target } = parseWikilinkTarget(raw);

      if (kind === "link") {
        const allLinks = useLinksStore.getState().all();
        const link = allLinks.find(
          (l: { id: string; title: string }) =>
            l.title.toLowerCase() === target.toLowerCase() || l.id === target,
        );
        if (link) {
          useLayoutStore.getState().openTab({ type: "link", id: link.id });
        }
        return;
      }

      if (kind === "secret") {
        const parts = target.split("/");
        const hasVault = parts.length > 1;
        const vaultSlug = hasVault ? (parts[0] ?? "") : "";
        const name = hasVault ? parts.slice(1).join("/") : target;
        useLayoutStore.getState().openTab({ type: "secret", vault: vaultSlug, name });
        return;
      }

      // kind === "note"
      if (isValidYMD(target)) {
        openJournal(target);
        setView("notes");
        return;
      }
      const notes = useNotesStore.getState().all();
      const wanted = target.toLowerCase();
      const found = notes.find(
        (n) => noteTitle(n).trim().toLowerCase() === wanted,
      );
      if (found) {
        setView("notes");
        openNoteInLayout(found.id);
        return;
      }
      const created = upsert({ title: target, body: `# ${target}\n\n` });
      setView("notes");
      openNoteInLayout(created.id);
    }
    window.addEventListener("notekit:open-wikilink", onOpen as EventListener);
    return () =>
      window.removeEventListener("notekit:open-wikilink", onOpen as EventListener);
  }, [upsert, setActive, openJournal, openNoteInLayout, setView]);
}
