import { Node, mergeAttributes } from "@tiptap/react";

// Inline media embeds for video, audio, and PDF.
// Uses the same ![alt](url) markdown syntax as images — detected by extension.
// The existing Image extension handles actual images; this handles the rest.

type MediaKind = "video" | "audio" | "pdf";

const VIDEO_EXTS = /\.(mp4|webm|ogv|mov)(\?.*)?$/i;
const AUDIO_EXTS = /\.(mp3|ogg|oga|wav|flac|aac|m4a)(\?.*)?$/i;
const PDF_EXTS = /\.pdf(\?.*)?$/i;

export function detectMediaKind(src: string): MediaKind | null {
  if (VIDEO_EXTS.test(src)) return "video";
  if (AUDIO_EXTS.test(src)) return "audio";
  if (PDF_EXTS.test(src)) return "pdf";
  return null;
}

export const Media = Node.create({
  name: "media",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      kind: { default: "video" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-media]",
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return {
            src: e.getAttribute("data-src") ?? "",
            alt: e.getAttribute("data-alt") ?? "",
            kind: e.getAttribute("data-media") ?? "video",
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const kind = node.attrs.kind as MediaKind;
    const src = node.attrs.src as string;
    const alt = (node.attrs.alt as string) || "";
    const attrs = mergeAttributes(HTMLAttributes, {
      "data-media": kind,
      "data-src": src,
      "data-alt": alt,
      class: `nk-media nk-media--${kind}`,
    });
    if (kind === "video") {
      return ["div", attrs, ["video", { src, controls: "", preload: "metadata", title: alt }]];
    }
    if (kind === "audio") {
      return ["div", attrs, ["audio", { src, controls: "", preload: "metadata", title: alt }]];
    }
    return ["div", attrs, ["iframe", { src, title: alt, loading: "lazy" }]];
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write(s: string): void },
          node: { attrs: { src: string; alt: string } },
        ) {
          const alt = node.attrs.alt || "";
          state.write(`![${alt}](${node.attrs.src})`);
        },
        parse: {
          // After markdown-it renders, replace <img> whose src is a media file
          // with our data-media wrapper so parseHTML() picks it up.
          updateDOM(element: Element) {
            element.querySelectorAll("img").forEach((img) => {
              const src = img.getAttribute("src") ?? "";
              const kind = detectMediaKind(src);
              if (!kind) return;
              const div = document.createElement("div");
              div.setAttribute("data-media", kind);
              div.setAttribute("data-src", src);
              div.setAttribute("data-alt", img.getAttribute("alt") ?? "");
              // Tiptap reads attrs via parseHTML getAttrs; add them as data attrs
              // so the node's parseHTML rule can find them.
              div.setAttribute("data-kind", kind);
              img.replaceWith(div);
            });
          },
        },
      },
    };
  },
});
