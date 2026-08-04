/**
 * Render an assistant chat message to safe HTML.
 *
 * Two jobs:
 *  1. Strip reasoning blocks. Some models (e.g. MiniMax) inline their chain of
 *     thought in `<think>…</think>` — users shouldn't see it. Unclosed blocks
 *     (still streaming) are hidden entirely until the answer arrives.
 *  2. Render markdown (bold, lists, code, links) and sanitize the result.
 */
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const md = new MarkdownIt({
  html: false, // never trust raw HTML from the model
  linkify: true,
  breaks: true,
});

export function stripThink(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "") // complete reasoning blocks
    .replace(/<think>[\s\S]*$/i, "") // an unclosed block still streaming in
    .trim();
}

export function renderAssistantHtml(text: string): string {
  const clean = stripThink(text);
  if (!clean) return "";
  const html = md.render(clean);
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "del", "code", "pre", "blockquote",
      "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "hr", "table",
      "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: ["href", "title"],
  });
}
