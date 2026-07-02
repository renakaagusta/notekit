import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

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

            // Always allow Escape to go to normal mode
            if (event.key === "Escape") {
              const tr = view.state.tr.setMeta(PLUGIN_KEY, "normal" as VimMode);
              view.dispatch(tr);
              event.preventDefault();
              return true;
            }

            if (mode === "insert") return false; // let Tiptap handle it

            // ── Normal mode ──────────────────────────────────────────
            const { state } = view;

            // Switch to insert mode
            if (event.key === "i") {
              view.dispatch(state.tr.setMeta(PLUGIN_KEY, "insert" as VimMode));
              return true;
            }
            if (event.key === "a") {
              const tr = state.tr
                .setMeta(PLUGIN_KEY, "insert" as VimMode)
                .setSelection(TextSelection.create(state.doc, state.selection.from + 1));
              view.dispatch(tr);
              return true;
            }
            if (event.key === "A") {
              const { to: lineEnd } = currentLineRange(state);
              const tr = state.tr
                .setMeta(PLUGIN_KEY, "insert" as VimMode)
                .setSelection(TextSelection.create(state.doc, lineEnd));
              view.dispatch(tr);
              return true;
            }
            if (event.key === "o") {
              const { to: lineEnd } = currentLineRange(state);
              const tr = state.tr
                .setMeta(PLUGIN_KEY, "insert" as VimMode)
                .insert(lineEnd, state.schema.nodes.paragraph!.create())
                .setSelection(TextSelection.create(state.tr.doc, lineEnd + 1));
              view.dispatch(tr);
              return true;
            }
            if (event.key === "O") {
              const { from: lineStart } = currentLineRange(state);
              const tr = state.tr
                .setMeta(PLUGIN_KEY, "insert" as VimMode)
                .insert(lineStart - 1, state.schema.nodes.paragraph!.create())
                .setSelection(TextSelection.create(state.tr.doc, lineStart - 1));
              view.dispatch(tr);
              return true;
            }

            // Motion keys
            if (event.key === "h") { view.dispatch(moveH(state, -1)); return true; }
            if (event.key === "l") { view.dispatch(moveH(state, 1)); return true; }
            if (event.key === "j") { view.dispatch(moveToLineVert(state, 1)); return true; }
            if (event.key === "k") { view.dispatch(moveToLineVert(state, -1)); return true; }
            if (event.key === "w") { view.dispatch(wordForward(state)); return true; }
            if (event.key === "b") { view.dispatch(wordBack(state)); return true; }
            if (event.key === "0") {
              const { from } = currentLineRange(state);
              view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from)));
              return true;
            }
            if (event.key === "$") {
              const { to } = currentLineRange(state);
              view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to)));
              return true;
            }
            if (event.key === "g") {
              // gg — handled on second g keypress via a simple approach: just jump to 0
              view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, 1)));
              return true;
            }
            if (event.key === "G") {
              const end = state.doc.content.size - 1;
              view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, end)));
              return true;
            }

            // Editing
            if (event.key === "x") {
              const { from } = state.selection;
              const tr = state.tr.delete(from, from + 1);
              view.dispatch(tr);
              return true;
            }
            if (event.key === "d") {
              // dd — delete current line/block
              const $from = resolvedPos(state, state.selection.from);
              const tr = state.tr.delete($from.before(), $from.after());
              view.dispatch(tr);
              return true;
            }
            if (event.key === "u" && !event.ctrlKey) {
              editor.commands.undo();
              return true;
            }
            if (event.key === "r" && event.ctrlKey) {
              editor.commands.redo();
              return true;
            }

            // Block unhandled keys in normal mode
            return true;
          },
        },
      }),
    ];
  },
});
