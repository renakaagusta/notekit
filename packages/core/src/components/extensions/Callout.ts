import { Node, mergeAttributes } from "@tiptap/react";

// Obsidian-compatible callout blocks: > [!TYPE] optional title
// Supported types match Obsidian's callout vocabulary.

export const CALLOUT_TYPES = [
  "note", "info", "tip", "warning", "danger",
  "success", "question", "failure", "bug", "example", "quote",
] as const;

type CalloutType = (typeof CALLOUT_TYPES)[number];

const ICONS: Record<CalloutType, string> = {
  note: "📝", info: "ℹ️", tip: "💡", warning: "⚠️", danger: "🔥",
  success: "✅", question: "❓", failure: "❌", bug: "🐛",
  example: "📋", quote: "💬",
};

// markdown-it rule: detect `> [!TYPE]` on first line of a blockquote
interface MdToken { type: string; tag: string; nesting: number; attrSet(k: string, v: string): void; content: string; }
interface MdCore { tokens: MdToken[]; }
interface Md { core: { ruler: { push(name: string, fn: (state: MdCore) => void): void } } }

function calloutPlugin(md: Md) {
  md.core.ruler.push("callout", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i];
      if (!open || open.type !== "blockquote_open") continue;
      // Find the inline content inside the first paragraph of this blockquote
      const inlineIdx = tokens.findIndex((t, j) => j > i && t.type === "inline");
      if (inlineIdx === -1) continue;
      const inline = tokens[inlineIdx];
      if (!inline) continue;
      const match = inline.content.match(/^\[!(\w+)\][\t ]*(.*)/i);
      if (!match) continue;
      const [, rawType, title] = match;
      const type = (rawType?.toLowerCase() ?? "note") as CalloutType;
      // Rewrite blockquote_open to callout_open
      open.type = "callout_open";
      open.tag = "div";
      open.attrSet("data-callout", type);
      if (title) open.attrSet("data-title", title.trim());
      // Remove the first inline token (the [!TYPE] line) and its wrapping paragraph
      const paraOpen = tokens[inlineIdx - 1];
      const paraClose = tokens[inlineIdx + 1];
      if (paraOpen?.type === "paragraph_open") tokens.splice(inlineIdx - 1, 1);
      // after splice inlineIdx shifted
      const newInlineIdx = tokens.findIndex((t, j) => j > i && t.type === "inline" && t.content === inline.content);
      if (newInlineIdx !== -1) tokens.splice(newInlineIdx, 1);
      const newParaClose = tokens.findIndex((t, j) => j > i && t.type === "paragraph_close");
      if (newParaClose !== -1 && tokens[newParaClose] === paraClose) tokens.splice(newParaClose, 1);
      // Rewrite blockquote_close to callout_close
      const closeIdx = tokens.findIndex((t, j) => j > i && t.type === "blockquote_close");
      if (closeIdx !== -1) {
        const close = tokens[closeIdx];
        if (close) { close.type = "callout_close"; close.tag = "div"; }
      }
    }
  });
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",

  addAttributes() {
    return {
      type: { default: "note" },
      title: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-callout]",
        getAttrs: (el) => ({
          type: (el as HTMLElement).getAttribute("data-callout") ?? "note",
          title: (el as HTMLElement).getAttribute("data-title") ?? "",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = (node.attrs.type as CalloutType) || "note";
    const title = (node.attrs.title as string) || (type.charAt(0).toUpperCase() + type.slice(1));
    const icon = ICONS[type] ?? "📝";
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: `nk-callout nk-callout--${type}`, "data-callout": type }),
      [
        "div",
        { class: "nk-callout-title", contenteditable: "false" },
        `${icon} ${title}`,
      ],
      ["div", { class: "nk-callout-body" }, 0],
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write(s: string): void; renderContent(node: unknown): void; out: string },
          node: { attrs: { type: string; title: string }; content: unknown },
        ) {
          const type = node.attrs.type || "note";
          const title = node.attrs.title ? ` ${node.attrs.title}` : "";
          // Write [!TYPE] header, then prefix every content line with "> "
          const before = state.out;
          state.write(`> [!${type.toUpperCase()}]${title}\n`);
          // Render content into a temporary buffer then prefix each line
          const tmpOut = state.out;
          state.renderContent(node);
          const content = state.out.slice(tmpOut.length);
          // Overwrite with prefixed version
          (state as { out: string }).out =
            state.out.slice(0, tmpOut.length) +
            content
              .split("\n")
              .map((line: string) => (line ? `> ${line}` : ">"))
              .join("\n");
        },
        parse: {
          setup: calloutPlugin,
        },
      },
    };
  },
});
