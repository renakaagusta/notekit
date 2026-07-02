import { useEffect, useImperativeHandle, forwardRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor as TipTapEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Image } from "@tiptap/extension-image";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import DOMPurify from "dompurify";
import { Highlight } from "./extensions/Highlight";
import { BlockMath, InlineMath } from "./extensions/Math";
import { Callout } from "./extensions/Callout";
import { Mermaid } from "./extensions/Mermaid";
import { Media } from "./extensions/Media";
import { SlashCommands } from "./extensions/SlashCommands";
import { VimMode } from "./extensions/VimMode";
import { Wikilink } from "./extensions/Wikilink";

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"] as string[],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"] as string[],
};

function sanitize(md: string): string {
  if (typeof window === "undefined") return md;
  return String(DOMPurify.sanitize(md, PURIFY_CONFIG));
}

interface EditorProps {
  value: string;
  onChange(value: string): void;
  readOnly?: boolean;
  vimMode?: boolean;
}

export interface EditorHandle {
  editor: TipTapEditor | null;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  { value, onChange, readOnly = false, vimMode = false },
  ref,
) {
  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: "nk-code" } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      Link.configure({ openOnClick: false, autolink: true }),
      Highlight.configure({ multicolor: false }),
      BlockMath,
      InlineMath,
      Callout,
      Mermaid,
      Media,
      SlashCommands,
      VimMode.configure({ enabled: vimMode }),
      Wikilink,
      // The first line of the body becomes the note title (via
      // noteTitle()), so cue users to type a meaningful title first
      // rather than a generic "write anything" prompt.
      Placeholder.configure({ placeholder: "Start with a title…" }),
      Markdown.configure({
        html: true,
        tightLists: true,
        bulletListMarker: "-",
        linkify: true,
        breaks: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: sanitize(value),
    onUpdate({ editor }) {
      const md = (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
      onChange(md);
    },
    editorProps: {
      attributes: { class: "nk-prose" },
      handleClickOn(_view, _pos, node, _nodePos, event) {
        if (node.type.name === "wikilink") {
          const target = node.attrs.target as string;
          if (target) {
            event.preventDefault();
            window.dispatchEvent(
              new CustomEvent("notekit:open-wikilink", { detail: { target } }),
            );
            return true;
          }
        }
        return false;
      },
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      get editor() {
        return editor;
      },
    }),
    [editor],
  );

  useEffect(() => {
    if (!editor) return;
    const current: string = (editor.storage as unknown as { markdown: MarkdownStorage }).markdown.getMarkdown();
    if (current === value) return;
    editor.commands.setContent(sanitize(value), { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    function onClick(e: Event) {
      const t = e.target as HTMLElement | null;
      const el = t?.closest?.("[data-wikilink]") as HTMLElement | null;
      if (!el) return;
      const target = el.getAttribute("data-wikilink");
      if (!target) return;
      e.preventDefault();
      window.dispatchEvent(
        new CustomEvent("notekit:open-wikilink", { detail: { target } }),
      );
    }
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [editor]);

  return <EditorContent editor={editor} className="nk-editor" />;
});
