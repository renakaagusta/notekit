import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import { Extension } from "@tiptap/react";

// Basic vim normal/insert mode for Tiptap.
// Covers: mode switching, hjkl, w/b/e, 0/$, gg/G, x, dd, u, Ctrl+r, i/a/A/o/O.
// Does NOT cover: registers, macros, visual mode, ex commands.

type VimMode = "normal" | "insert";

const PLUGIN_KEY = new PluginKey<VimMode>("vim");

function resolvedPos(state: EditorState, pos: number) {
  return state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
}

function currentLineRange(state: EditorState) {
  const { from } = state.selection;
  const $pos = resolvedPos(state, from);
  const lineStart = $pos.start();
  const lineEnd = $pos.end();
  return { from: lineStart, to: lineEnd };
}

function moveH(state: EditorState, delta: number): Transaction {
  const { from } = state.selection;
  const pos = Math.max(0, Math.min(state.doc.content.size, from + delta));
  const tr = state.tr.setSelection(TextSelection.create(state.doc, pos));
  return tr;
}

function moveToLineVert(state: EditorState, dir: 1 | -1): Transaction {
  const { from } = state.selection;
  const $from = resolvedPos(state, from);
  const col = from - $from.start();

  if (dir === -1) {
    // move up: go to previous block's start + same col offset
    if ($from.before() === 0) return state.tr;
    const prevEnd = $from.before() - 1;
    if (prevEnd <= 0) return state.tr;
    const $prev = resolvedPos(state, prevEnd);
    const targetPos = Math.min($prev.start() + col, $prev.end());
    return state.tr.setSelection(TextSelection.create(state.doc, targetPos));
  } else {
    // move down: go to next block's start + same col offset
    const nextStart = $from.after();
    if (nextStart >= state.doc.content.size) return state.tr;
    const $next = resolvedPos(state, nextStart + 1);
    const targetPos = Math.min($next.start() + col, $next.end());
    return state.tr.setSelection(TextSelection.create(state.doc, targetPos));
  }
}

function wordForward(state: EditorState): Transaction {
  const { from } = state.selection;
  const text = state.doc.textBetween(from, state.doc.content.size, " ");
  const match = text.match(/^\s*\S+\s*/);
  const skip = match ? match[0].length : 1;
  const pos = Math.min(state.doc.content.size, from + skip);
  return state.tr.setSelection(TextSelection.create(state.doc, pos));
}

function wordBack(state: EditorState): Transaction {
  const { from } = state.selection;
  const text = state.doc.textBetween(0, from, " ");
  const match = text.match(/\S+\s*$/);
  const skip = match ? match[0].length : 1;
  const pos = Math.max(0, from - skip);
  return state.tr.setSelection(TextSelection.create(state.doc, pos));
}

function handleInsertModeEntry(key: string, state: EditorState, view: EditorView): boolean {
  if (key === "i") {
    view.dispatch(state.tr.setMeta(PLUGIN_KEY, "insert" as VimMode));
    return true;
  }
  if (key === "a") {
    const tr = state.tr
      .setMeta(PLUGIN_KEY, "insert" as VimMode)
      .setSelection(TextSelection.create(state.doc, state.selection.from + 1));
    view.dispatch(tr);
    return true;
  }
  if (key === "A") {
    const { to: lineEnd } = currentLineRange(state);
    const tr = state.tr
      .setMeta(PLUGIN_KEY, "insert" as VimMode)
      .setSelection(TextSelection.create(state.doc, lineEnd));
    view.dispatch(tr);
    return true;
  }
  if (key === "o") {
    const { to: lineEnd } = currentLineRange(state);
    const tr = state.tr
      .setMeta(PLUGIN_KEY, "insert" as VimMode)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- paragraph node is a built-in ProseMirror node type that always exists in Tiptap's schema
      .insert(lineEnd, state.schema.nodes.paragraph!.create())
      .setSelection(TextSelection.create(state.tr.doc, lineEnd + 1));
    view.dispatch(tr);
    return true;
  }
  if (key === "O") {
    const { from: lineStart } = currentLineRange(state);
    const tr = state.tr
      .setMeta(PLUGIN_KEY, "insert" as VimMode)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- paragraph node is a built-in ProseMirror node type that always exists in Tiptap's schema
      .insert(lineStart - 1, state.schema.nodes.paragraph!.create())
      .setSelection(TextSelection.create(state.tr.doc, lineStart - 1));
    view.dispatch(tr);
    return true;
  }
  return false;
}

function handleMotionKey(key: string, state: EditorState, view: EditorView): boolean {
  if (key === "h") { view.dispatch(moveH(state, -1)); return true; }
  if (key === "l") { view.dispatch(moveH(state, 1)); return true; }
  if (key === "j") { view.dispatch(moveToLineVert(state, 1)); return true; }
  if (key === "k") { view.dispatch(moveToLineVert(state, -1)); return true; }
  if (key === "w") { view.dispatch(wordForward(state)); return true; }
  if (key === "b") { view.dispatch(wordBack(state)); return true; }
  if (key === "0") {
    const { from } = currentLineRange(state);
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from)));
    return true;
  }
  if (key === "$") {
    const { to } = currentLineRange(state);
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to)));
    return true;
  }
  if (key === "g") {
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1)));
    return true;
  }
  if (key === "G") {
    const end = state.doc.content.size - 1;
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, end)));
    return true;
  }
  return false;
}

function handleEditKey(key: string, ctrlKey: boolean, state: EditorState, view: EditorView, editor: Editor): boolean {
  if (key === "x") {
    const { from } = state.selection;
    view.dispatch(state.tr.delete(from, from + 1));
    return true;
  }
  if (key === "d") {
    const $from = resolvedPos(state, state.selection.from);
    view.dispatch(state.tr.delete($from.before(), $from.after()));
    return true;
  }
  if (key === "u" && !ctrlKey) {
    editor.commands.undo();
    return true;
  }
  if (key === "r" && ctrlKey) {
    editor.commands.redo();
    return true;
  }
  return false;
}

export const VimMode = Extension.create({
  name: "vimMode",

  addOptions() {
    return { enabled: false };
  },

  addProseMirrorPlugins() {
    if (!this.options.enabled) return [];

    const editor = this.editor;

    return [
      new Plugin({
        key: PLUGIN_KEY,
        state: {
          init: () => "insert" as VimMode,
          apply(tr, mode) {
            const meta = tr.getMeta(PLUGIN_KEY) as VimMode | undefined;
            return meta ?? mode;
          },
        },
        view() {
          return {
            update(view: EditorView) {
              const mode = PLUGIN_KEY.getState(view.state);
              view.dom.setAttribute("data-vim-mode", mode ?? "insert");
            },
          };
        },
        props: {
          handleKeyDown(view, event) {
            const mode = PLUGIN_KEY.getState(view.state) ?? "insert";

            if (event.key === "Escape") {
              view.dispatch(view.state.tr.setMeta(PLUGIN_KEY, "normal" as VimMode));
              event.preventDefault();
              return true;
            }

            if (mode === "insert") return false;

            const { state } = view;

            if (handleInsertModeEntry(event.key, state, view)) return true;
            if (handleMotionKey(event.key, state, view)) return true;
            if (handleEditKey(event.key, event.ctrlKey, state, view, editor)) return true;

            // Block unhandled keys in normal mode
            return true;
          },
        },
      }),
    ];
  },
});
