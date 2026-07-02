import { Extension, ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import type { Editor } from "@tiptap/react";
import tippy, { type Instance } from "tippy.js";
import { SlashCommandMenu, type SlashCommandMenuHandle } from "../SlashCommandMenu";

export interface SlashCommand {
  title: string;
  description: string;
  keywords: string[];
  action: (editor: Editor) => void;
}

export const DEFAULT_SLASH_COMMANDS: SlashCommand[] = [
  {
    title: "Heading 1",
    description: "Large section heading",
    keywords: ["h1", "heading", "title"],
    action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    keywords: ["h2", "heading", "subtitle"],
    action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    keywords: ["h3", "heading"],
    action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: "Bullet list",
    description: "Unordered list",
    keywords: ["ul", "bullet", "list", "-"],
    action: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    description: "Ordered list",
    keywords: ["ol", "number", "list", "1"],
    action: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    title: "Task list",
    description: "Checklist with checkboxes",
    keywords: ["todo", "task", "check", "checkbox"],
    action: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    title: "Code block",
    description: "Fenced code block",
    keywords: ["code", "pre", "```"],
    action: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: "Blockquote",
    description: "Indented quote block",
    keywords: ["quote", "blockquote", ">"],
    action: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    title: "Divider",
    description: "Horizontal rule",
    keywords: ["hr", "divider", "rule", "---"],
    action: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    title: "Table",
    description: "Insert a table",
    keywords: ["table", "grid"],
    action: (e) =>
      e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: "Note callout",
    description: "> [!NOTE] callout block",
    keywords: ["callout", "note", "admonition"],
    action: (e) =>
      e.chain().focus().insertContent({
        type: "callout",
        attrs: { type: "note", title: "" },
        content: [{ type: "paragraph" }],
      }).run(),
  },
  {
    title: "Warning callout",
    description: "> [!WARNING] callout block",
    keywords: ["callout", "warning", "alert"],
    action: (e) =>
      e.chain().focus().insertContent({
        type: "callout",
        attrs: { type: "warning", title: "" },
        content: [{ type: "paragraph" }],
      }).run(),
  },
  {
    title: "Mermaid diagram",
    description: "Flowchart, sequence diagram, etc.",
    keywords: ["mermaid", "diagram", "chart", "flow"],
    action: (e) =>
      e.chain().focus().insertContent({
        type: "mermaid",
        attrs: { code: "flowchart TD\n    A[Start] --> B[End]" },
      }).run(),
  },
  {
    title: "Math block",
    description: "$$LaTeX$$ equation block",
    keywords: ["math", "latex", "equation", "$$"],
    action: (e) =>
      e.chain().focus().insertContent({
        type: "blockMath",
        attrs: { latex: "" },
      }).run(),
  },
];

export type SlashCommandsOptions = {
  commands: SlashCommand[];
};

function buildRender() {
  let component: ReactRenderer<SlashCommandMenuHandle> | null = null;
  let popup: Instance | null = null;

  return {
    onStart(props: SuggestionProps<SlashCommand>) {
      component = new ReactRenderer(SlashCommandMenu, {
        props,
        editor: props.editor,
      });

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

    onUpdate(props: SuggestionProps<SlashCommand>) {
      component?.updateProps(props);
      if (props.clientRect) {
        popup?.setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
      }
    },

    onKeyDown(props: { event: KeyboardEvent }) {
      if (props.event.key === "Escape") {
        popup?.hide();
        return true;
      }
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

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slashCommands",

  addOptions() {
    return { commands: DEFAULT_SLASH_COMMANDS };
  },

  addProseMirrorPlugins() {
    const commands = this.options.commands;
    return [
      Suggestion<SlashCommand>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        items({ query }) {
          const q = query.toLowerCase();
          return commands.filter(
            (cmd) =>
              cmd.title.toLowerCase().includes(q) ||
              cmd.keywords.some((k) => k.includes(q)),
          );
        },
        command({ editor, range, props }) {
          editor.chain().focus().deleteRange(range).run();
          props.action(editor);
        },
        render: buildRender,
      }),
    ];
  },
});
