import { Extension, ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { type Instance } from "tippy.js";
import { WikilinkMenu, type WikilinkMenuHandle, type WikilinkItem } from "../WikilinkMenu";
import { useNotesStore } from "../../stores/notesStore";
import { noteTitle } from "../../lib/note-display";

function buildRender() {
  let component: ReactRenderer<WikilinkMenuHandle> | null = null;
  let popup: Instance | null = null;

  return {
    onStart(props: SuggestionProps<WikilinkItem>) {
      component = new ReactRenderer(WikilinkMenu, { props, editor: props.editor });
      if (!props.clientRect) return;
      const [inst] = tippy("body", {
        getReferenceClientRect: props.clientRect as () => DOMRect,
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
        theme: "nk-slash",
      });
      popup = inst ?? null;
    },
    onUpdate(props: SuggestionProps<WikilinkItem>) {
      component?.updateProps(props);
      if (props.clientRect) {
        popup?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
      }
    },
    onKeyDown(props: { event: KeyboardEvent }) {
      if (props.event.key === "Escape") { popup?.hide(); return true; }
      return component?.ref?.onKeyDown(props.event) ?? false;
    },
    onExit() {
      popup?.destroy();
      component?.destroy();
      popup = null;
      component = null;
    },
  };
}

export const WikilinkSuggestion = Extension.create({
  name: "wikilinkSuggestion",

  addProseMirrorPlugins() {
    return [
      Suggestion<WikilinkItem>({
        pluginKey: new PluginKey("wikilinkSuggestion"),
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        items({ query }) {
          const notes = useNotesStore.getState().notes;
          const q = query.toLowerCase();
          return Object.values(notes)
            .map((n) => ({ id: n.id, title: noteTitle(n) || "Untitled" }))
            .filter((n) => !q || n.title.toLowerCase().includes(q))
            .sort((a, b) => a.title.localeCompare(b.title))
            .slice(0, 10);
        },
        command({ editor, range, props }) {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({ type: "wikilink", attrs: { target: props.title } })
            .run();
        },
        render: buildRender,
      }),
    ];
  },
});
