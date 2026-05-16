import type { Note } from "../types/note";
import type { Ticket } from "../types/ticket";
import { noteTitle } from "./note-display";

export function slugify(text: string): string {
  const ascii = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function shortId(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, "").slice(0, 6) || "x";
}

function folderSegment(folder: string | null | undefined): string {
  if (!folder) return "";
  const cleaned = folder
    .split("/")
    .map((s) => slugify(s))
    .filter(Boolean)
    .join("/");
  return cleaned ? `${cleaned}/` : "";
}

export function notePathFor(
  note: Pick<Note, "id" | "body" | "folder"> & { title?: string },
): string {
  const title = noteTitle({ body: note.body, title: note.title ?? "" });
  const slug = slugify(title) || "untitled";
  return `notes/${folderSegment(note.folder)}${slug}--${shortId(note.id)}.md`;
}

export function ticketPathFor(t: Pick<Ticket, "id" | "title">): string {
  const slug = slugify(t.title || "") || "untitled";
  return `tickets/${slug}--${shortId(t.id)}.md`;
}
