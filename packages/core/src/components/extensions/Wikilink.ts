import { Node, mergeAttributes, nodeInputRule } from "@tiptap/react";

interface WikilinkAttrs {
  target: string;
}

interface WikilinkMarkdownStorage {
  serialize(state: MdSerializerState, node: PmNode): void;
  parse: {
    setup(md: MarkdownIt): void;
  };
}

interface MdSerializerState {
  write(text: string): void;
}

interface PmNode {
  attrs: WikilinkAttrs;
}

interface MarkdownIt {
  inline: {
    ruler: {
      after(
        before: string,
        name: string,
        fn: (state: InlineState, silent: boolean) => boolean,
      ): void;
    };
  };
  renderer: {
    rules: Record<string, (tokens: InlineToken[], idx: number) => string>;
  };
  utils: { escapeHtml(s: string): string };
}

interface InlineToken {
  content: string;
  attrGet(name: string): string | null;
  attrSet(name: string, value: string): void;
}

interface InlineState {
  src: string;
  pos: number;
  push(type: string, tag: string, nesting: number): InlineToken;
}

const OPEN = 0x5b; // [
const CLOSE = 0x5d; // ]

function wikilinkRule(state: InlineState, silent: boolean): boolean {
  const start = state.pos;
  if (
    state.src.charCodeAt(start) !== OPEN ||
    state.src.charCodeAt(start + 1) !== OPEN
  ) {
    return false;
  }
  let end = -1;
  for (let i = start + 2; i < state.src.length - 1; i++) {
    if (
      state.src.charCodeAt(i) === CLOSE &&
      state.src.charCodeAt(i + 1) === CLOSE
    ) {
      end = i;
      break;
    }
    if (state.src.charCodeAt(i) === OPEN) return false;
  }
  if (end === -1) return false;
  const target = state.src.slice(start + 2, end).trim();
  if (!target) return false;
  if (!silent) {
    const token = state.push("wikilink", "span", 0);
    token.content = target;
    token.attrSet("data-wikilink", target);
  }
  state.pos = end + 2;
  return true;
}

export const Wikilink = Node.create({
  name: "wikilink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-wikilink") ?? "",
        renderHTML: (attrs) => ({ "data-wikilink": attrs.target }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-wikilink]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const target = node.attrs.target ?? "";
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "nk-wikilink" }),
      target,
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.target}]]`;
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /\[\[[^\[\]]+\]\]$/,
        type: this.type,
        getAttributes: (match) => ({
          target: match[0].slice(2, -2).trim(),
        }),
      }),
    ];
  },

  addStorage(): { markdown: WikilinkMarkdownStorage } {
    return {
      markdown: {
        serialize(state, node) {
          state.write(`[[${node.attrs.target}]]`);
        },
        parse: {
          setup(md) {
            md.inline.ruler.after("emphasis", "wikilink", wikilinkRule);
            md.renderer.rules.wikilink = (tokens, idx) => {
              const t = tokens[idx];
              if (!t) return "";
              const target = md.utils.escapeHtml(t.attrGet("data-wikilink") ?? "");
              return `<span data-wikilink="${target}" class="nk-wikilink">${md.utils.escapeHtml(
                t.content,
              )}</span>`;
            };
          },
        },
      },
    };
  },
});
