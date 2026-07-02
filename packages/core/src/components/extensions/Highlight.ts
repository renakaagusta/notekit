import { Highlight as TiptapHighlight } from "@tiptap/extension-highlight";
// @ts-ignore — no types shipped; plugin is tiny and stable
import markdownItMark from "markdown-it-mark";

// Extends the Tiptap Highlight mark with ==text== markdown serialization
// so tiptap-markdown can round-trip highlights through plain .md files.
export const Highlight = TiptapHighlight.extend({
  addStorage() {
    return {
      markdown: {
        serialize: {
          open: "==",
          close: "==",
          mixable: true,
          expelEnclosingWhitespace: true,
        },
        parse: {
          setup(md: { use: (plugin: unknown) => void }) {
            md.use(markdownItMark);
          },
        },
      },
    };
  },
});
