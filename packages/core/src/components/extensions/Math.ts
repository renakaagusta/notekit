import { BlockMath as TiptapBlockMath, InlineMath as TiptapInlineMath } from "@tiptap/extension-mathematics";
// @ts-ignore — no types shipped
import markdownItKatex from "@iktakahiro/markdown-it-katex";

// Wraps Tiptap's BlockMath/InlineMath with tiptap-markdown storage so
// $$...$$ and $...$ round-trip correctly through plain .md files.

let katexPluginRegistered = false;

function setupKatexPlugin(md: { use: (plugin: unknown) => void }) {
  if (katexPluginRegistered) return;
  md.use(markdownItKatex);
  katexPluginRegistered = true;
}

export const BlockMath = TiptapBlockMath.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: { write: (s: string) => void }, node: { attrs: { latex: string } }) {
          state.write(`$$\n${node.attrs.latex}\n$$`);
        },
        parse: {
          setup: setupKatexPlugin,
          updateDOM(element: Element) {
            element.querySelectorAll(".block-math").forEach((el) => {
              const div = document.createElement("div");
              div.setAttribute("data-type", "block-math");
              div.setAttribute("data-latex", el.textContent ?? "");
              el.replaceWith(div);
            });
          },
        },
      },
    };
  },
});

export const InlineMath = TiptapInlineMath.extend({
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: "$",
          close: "$",
          mixable: false,
          expelEnclosingWhitespace: true,
        },
        parse: {
          setup: setupKatexPlugin,
          updateDOM(element: Element) {
            element.querySelectorAll(".inline-math").forEach((el) => {
              const span = document.createElement("span");
              span.setAttribute("data-type", "inline-math");
              span.setAttribute("data-latex", el.textContent ?? "");
              el.replaceWith(span);
            });
          },
        },
      },
    };
  },
});
