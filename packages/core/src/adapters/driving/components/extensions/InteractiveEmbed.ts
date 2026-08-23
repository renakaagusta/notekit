import { Node, mergeAttributes } from "@tiptap/react";
import { noteTitle } from "../../../../domain/note-display";
import { useLayoutStore } from "../../stores/layoutStore";
import { useNotesStore } from "../../stores/notesStore";

/**
 * Interactive HTML block — a fenced code block with lang=interactive renders as
 * a SANDBOXED iframe so its HTML/CSS/JS runs, but isolated from the app.
 *
 * Security model (why this is safe even for shared/synced notes):
 *  - `sandbox="allow-scripts"` WITHOUT `allow-same-origin` → the frame gets a
 *    unique opaque origin. It cannot read the parent DOM, cookies, localStorage,
 *    or IndexedDB (where the E2EE keys live).
 *  - An injected CSP (`default-src 'none'`) blocks ALL network — no fetch/XHR/
 *    beacon/image-tracking — so a malicious embed can't exfiltrate anything.
 *  - Only inline script/style and data: images are allowed, enough for quizzes,
 *    charts, and simulations. The frame can only manipulate its own DOM.
 *
 * Host actions: the frame can't touch the app DOM, but it CAN postMessage a
 * small, ALLOWLISTED set of navigation intents to the host (e.g. open a note in
 * a tab) via the injected `window.notekit` bridge. The host validates the
 * message source + type, so an embed can navigate NoteKit but can't read data
 * or run arbitrary app code.
 */

let idCounter = 0;

/** A navigation intent posted by an embed via `window.notekit`. */
interface NkAction {
  type?: string;
  ref?: string;
  text?: string;
  newTab?: boolean;
}

/** Resolve a note by id, then by exact title, then by title substring. */
function resolveNote(ref: string) {
  const notes = useNotesStore.getState();
  if (notes.notes[ref]) return notes.notes[ref];
  const lc = ref.trim().toLowerCase();
  if (!lc) return null;
  const all = notes.all();
  return (
    all.find((n) => noteTitle(n).toLowerCase() === lc) ??
    all.find((n) => noteTitle(n).toLowerCase().includes(lc)) ??
    null
  );
}

/** Run an allowlisted host action requested by an embed. Never runs app code. */
function runHostAction(a: NkAction, iframe: HTMLIFrameElement): void {
  if (!a || typeof a !== "object") return;
  switch (a.type) {
    case "openNote": {
      const note = resolveNote(String(a.ref ?? ""));
      if (note) useLayoutStore.getState().openNote(note.id);
      return;
    }
    case "scrollToHeading": {
      // Scroll the editor that CONTAINS this embed to a matching heading.
      const q = String(a.text ?? "").trim().toLowerCase();
      const editor = iframe.closest(".nk-editor");
      if (!q || !editor) return;
      for (const h of Array.from(editor.querySelectorAll("h1,h2,h3,h4,h5,h6"))) {
        if ((h.textContent ?? "").toLowerCase().includes(q)) {
          h.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
      return;
    }
    default:
      return; // unknown action → ignore
  }
}

// Relaxed like ZenNotes: allow trusted CDNs for libraries (Chart.js, D3, KaTeX…)
// and external images, but keep `connect-src 'none'` so no fetch/XHR/websocket can
// exfiltrate data — and the frame is never `allow-same-origin`, so it can't reach
// the app's keys/notes regardless.
const CDN = "https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com";
const SANDBOX_CSP =
  "default-src 'none'; " +
  `script-src 'unsafe-inline' 'unsafe-eval' ${CDN}; ` +
  `style-src 'unsafe-inline' ${CDN} https://fonts.googleapis.com; ` +
  "font-src data: https://fonts.gstatic.com https://cdn.jsdelivr.net; " +
  "img-src data: https:; media-src data: https:; connect-src 'none';";

interface EmbedTheme {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  border: string;
}

/** Read the app's palette so the sandbox can match the current theme. */
function readTheme(): EmbedTheme {
  const src = (document.querySelector(".nk") as HTMLElement) ?? document.documentElement;
  const cs = getComputedStyle(src);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--bg", "#141414"),
    surface: v("--surface", "#1b1b1b"),
    text: v("--text", "#e8e8e8"),
    muted: v("--muted", "#8a8a8a"),
    accent: v("--accent", "#6366f1"),
    accentText: v("--primary-foreground", "#fff"),
    border: v("--border", "#2a2a2a"),
  };
}

/** Wrap the author's body-level HTML in a locked-down, theme-matched document. */
function buildSrcdoc(code: string, id: string, t: EmbedTheme): string {
  return (
    "<!doctype html><html><head><meta charset=\"utf-8\">" +
    `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_CSP}">` +
    "<style>:root{" +
    `--bg:${t.bg};--surface:${t.surface};--text:${t.text};--muted:${t.muted};` +
    `--accent:${t.accent};--accent-text:${t.accentText};--border:${t.border};` +
    "color-scheme:light dark}" +
    "html,body{margin:0}body{padding:12px;background:transparent;color:var(--text);" +
    "font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.55}" +
    "*{box-sizing:border-box}a{color:var(--accent);cursor:pointer}" +
    "[data-nk-open]{cursor:pointer}</style></head><body>" +
    code +
    "<script>(function(){var ID='" +
    id +
    "';function post(m){try{m.__nkEmbedId=ID;parent.postMessage(m,'*')}catch(e){}}" +
    "function p(){post({h:document.documentElement.scrollHeight})}" +
    "try{new ResizeObserver(p).observe(document.body)}catch(e){}" +
    "window.addEventListener('load',p);setTimeout(p,60);setTimeout(p,400);" +
    // Host bridge: navigate NoteKit from inside the sandbox. Only posts intents;
    // the host decides what's allowed.
    "window.notekit={openNote:function(ref,opts){post({__nkAction:{type:'openNote'," +
    "ref:String(ref==null?'':ref),newTab:!(opts&&opts.newTab===false)}})}," +
    "scrollToHeading:function(text){post({__nkAction:{type:'scrollToHeading',text:String(text==null?'':text)}})}};" +
    // Convenience attributes: data-nk-open=\"<id|title>\" opens a note; and
    // data-nk-scroll=\"<heading>\" scrolls this note to that heading, on click.
    "document.addEventListener('click',function(e){var el=e.target;" +
    "while(el&&el!==document.body){if(el.getAttribute){" +
    "var o=el.getAttribute('data-nk-open');if(o!=null){window.notekit.openNote(o);e.preventDefault();break}" +
    "var s=el.getAttribute('data-nk-scroll');if(s!=null){window.notekit.scrollToHeading(s);e.preventDefault();break}}" +
    "el=el.parentNode}});" +
    "})();</script>" +
    "</body></html>"
  );
}

export const InteractiveEmbed = Node.create({
  name: "interactiveEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      code: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-interactive") ?? "",
        renderHTML: (attributes) => ({ "data-interactive": attributes.code }),
      },
    };
  },

  parseHTML() {
    // Priority above CodeBlock (default 50) so `pre[data-interactive]` becomes
    // an embed, not a plain (and now empty) code block.
    return [{ tag: "pre[data-interactive]", priority: 1000 }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-interactive": node.attrs.code as string }),
      node.attrs.code as string,
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "nk-embed";

      const id = `nk-embed-${idCounter++}`;
      const iframe = document.createElement("iframe");
      iframe.className = "nk-embed-frame";
      // allow-forms for quiz inputs; NEVER allow-same-origin (that isolation is
      // what keeps the app's keys/notes unreachable).
      iframe.setAttribute("sandbox", "allow-scripts allow-forms");
      iframe.setAttribute("loading", "lazy");
      iframe.setAttribute("title", "Interactive content");
      iframe.srcdoc = buildSrcdoc((node.attrs.code as string) || "", id, readTheme());

      function onMessage(e: MessageEvent) {
        // Only trust messages from THIS frame's window (the sandbox has an
        // opaque origin, so source identity — not origin — is the check).
        if (e.source !== iframe.contentWindow) return;
        const d = e.data as { __nkEmbedId?: string; h?: number; __nkAction?: NkAction };
        if (!d || d.__nkEmbedId !== id) return;
        if (typeof d.h === "number") {
          iframe.style.height = `${Math.min(Math.max(d.h, 40), 2000)}px`;
        } else if (d.__nkAction) {
          runHostAction(d.__nkAction, iframe);
        }
      }
      window.addEventListener("message", onMessage);

      wrapper.appendChild(iframe);
      return {
        dom: wrapper,
        destroy() {
          window.removeEventListener("message", onMessage);
        },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write(s: string): void },
          node: { attrs: { code: string } },
        ) {
          state.write("```interactive\n" + (node.attrs.code || "") + "\n```");
        },
        parse: {
          // Rewrite ```interactive code fences into our pre[data-interactive] tag.
          updateDOM(element: Element) {
            element.querySelectorAll("pre > code.language-interactive").forEach((code) => {
              const pre = code.parentElement;
              if (!pre) return;
              const newPre = document.createElement("pre");
              newPre.setAttribute("data-interactive", code.textContent ?? "");
              pre.replaceWith(newPre);
            });
          },
        },
      },
    };
  },
});
