import { useEffect } from "react";
import { shiftYMD, todayYMD } from "../lib/journal";
import { useLayoutStore } from "../stores/layoutStore";
import { useVaultStore } from "../stores/vaultStore";
import type { MainView } from "./AppTypes";

interface KeyboardShortcutHandlers {
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setView: (view: MainView) => void;
  setZenMode: React.Dispatch<React.SetStateAction<boolean>>;
  upsert: (note: { title: string; body: string; folder: string | null }) => { id: string };
  openNoteInLayout: (id: string) => void;
  openJournal: (ymd: string) => void;
}

export function useAppKeyboardShortcuts({
  setSearchOpen,
  setView,
  setZenMode,
  upsert,
  openNoteInLayout,
  openJournal,
}: KeyboardShortcutHandlers) {
  useEffect(() => {
    // eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- onKey dispatches all global keyboard shortcuts; each modifier+key combo is an unavoidable branch
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      // ⌘P / ⌘K → quick-open palette (Notion + VS Code muscle memory)
      if (key === "p" && !e.shiftKey) {
        e.preventDefault();
        setSearchOpen((open) => !open);
        return;
      }
      if (key === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
        return;
      }
      // ⌘⇧P → print active note
      if (key === "p" && e.shiftKey) {
        e.preventDefault();
        if (typeof window !== "undefined") window.print();
        return;
      }
      if (key === "n") {
        e.preventDefault();
        const folder = useVaultStore.getState().activeSettings?.defaultFolder ?? null;
        const created = upsert({ title: "Untitled", body: "", folder });
        openNoteInLayout(created.id);
        setView("notes");
        return;
      }
      // ⌘; → calendar
      if (key === ";") {
        e.preventDefault();
        setView("calendar");
        return;
      }
      // ⌘' → today's journal (⌘T is reserved by browsers for new-tab)
      if (key === "'") {
        e.preventDefault();
        const ymd = e.shiftKey ? shiftYMD(todayYMD(), 1) : todayYMD();
        openJournal(ymd);
        setView("notes");
      }
      // ⌘⇧Z → zen / focus mode
      if (key === "z" && e.shiftKey) {
        e.preventDefault();
        setZenMode((z) => !z);
      }
      // ⌘⇧O → outline panel
      if (key === "o" && e.shiftKey) {
        e.preventDefault();
        const pid = useLayoutStore.getState().activePaneId;
        useLayoutStore.getState().toggleOutline(pid);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen, setView, setZenMode, upsert, openNoteInLayout, openJournal]);
}
