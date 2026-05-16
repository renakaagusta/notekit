import type { Editor as TipTapEditor } from "@tiptap/react";

export type Heading = "h1" | "h2" | "h3" | "body";

export function setHeading(editor: TipTapEditor, kind: Heading) {
  const chain = editor.chain().focus();
  if (kind === "body") {
    chain.setParagraph().run();
    return;
  }
  const level = kind === "h1" ? 1 : kind === "h2" ? 2 : 3;
  chain.setHeading({ level }).run();
}

export function toggleBold(editor: TipTapEditor) {
  editor.chain().focus().toggleBold().run();
}

export function toggleItalic(editor: TipTapEditor) {
  editor.chain().focus().toggleItalic().run();
}

export function insertChecklist(editor: TipTapEditor) {
  editor.chain().focus().toggleTaskList().run();
}

export function insertTable(editor: TipTapEditor) {
  editor
    .chain()
    .focus()
    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    .run();
}

export function insertImage(editor: TipTapEditor, url: string, alt = "") {
  if (!url) return;
  editor.chain().focus().setImage({ src: url, alt }).run();
}

export function insertLink(editor: TipTapEditor, url: string) {
  if (!url) return;
  const { from, to, empty } = editor.state.selection;
  if (empty) {
    editor
      .chain()
      .focus()
      .insertContent([
        { type: "text", marks: [{ type: "link", attrs: { href: url } }], text: url },
      ])
      .run();
    return;
  }
  editor.chain().focus().setLink({ href: url }).setTextSelection(to).run();
  void from;
}

export function openSearch(_editor: TipTapEditor) {
  void _editor;
}
