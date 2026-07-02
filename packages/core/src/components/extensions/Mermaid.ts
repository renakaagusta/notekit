import { Node, mergeAttributes } from "@tiptap/react";

// Mermaid diagram block — fenced code with lang=mermaid renders as SVG.
// Falls back to a plain code block display if mermaid fails to load/parse.

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function getMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((m) => {
      m.default.initialize({ startOnLoad: false, theme: "dark" });
      return m.default;
    });
  }
  return mermaidReady;
}

let idCounter = 0;

export const Mermaid = Node.create({
  name: "mermaid",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      code: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "pre[data-mermaid]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-mermaid": node.attrs.code as string }),
      node.attrs.code as string,
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "nk-mermaid";

      function render() {
        const code = (node.attrs.code as string) || "";
        wrapper.textContent = "";
        getMermaid()
          .then(async (mermaid) => {
            const id = `nk-mermaid-${idCounter++}`;
            const { svg } = await mermaid.render(id, code);
            wrapper.innerHTML = svg;
          })
          .catch(() => {
            wrapper.textContent = code;
            wrapper.className = "nk-mermaid nk-mermaid--error";
          });
      }

      render();
      return { dom: wrapper };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write(s: string): void },
          node: { attrs: { code: string } },
        ) {
          state.write("```mermaid\n" + (node.attrs.code || "") + "\n```");
        },
        parse: {
          // Handled via the codeBlock → mermaid rewrite in the updateDOM hook below.
          updateDOM(element: Element) {
            element.querySelectorAll("pre > code.language-mermaid").forEach((code) => {
              const pre = code.parentElement;
              if (!pre) return;
              const newPre = document.createElement("pre");
              newPre.setAttribute("data-mermaid", code.textContent ?? "");
              pre.replaceWith(newPre);
            });
          },
        },
      },
    };
  },
});
