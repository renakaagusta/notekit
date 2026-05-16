/**
 * Cross-cutting search: notes (incl. journals), tickets, agents, commits.
 *
 * Design:
 * - Local sources (notes/tickets) score synchronously from the in-memory
 *   stores so the palette feels instant.
 * - Remote sources (agents/commits) are awaited separately and streamed in.
 * - One SearchHit shape so the palette doesn't care which source produced it.
 * - Scoring is intentionally simple: title/headline matches beat body
 *   matches, contiguous substring beats scattered subsequence, recency is
 *   a tiebreaker. No external fuzzy-search lib.
 */
import type { Note } from "../types/note";
import type { Ticket } from "../types/ticket";
import type { AgentProfile } from "./agents-api";
import type { VaultCommit } from "./vault-api";
import { noteTitle } from "./note-display";
import { journalYMDFromPath } from "./journal";

export type SearchKind =
  | "journal"
  | "note"
  | "ticket"
  | "agent"
  | "commit";

export interface SearchHit {
  kind: SearchKind;
  /** Stable key within the kind — used as React key. */
  key: string;
  /** What the user sees as the main row label. */
  title: string;
  /** One line of context (folder, status, date, sha…). */
  subtitle?: string;
  /** Optional snippet from the body, with highlight markers (…). */
  snippet?: string;
  /** 0..1, higher = better. Local + remote hits compete on the same axis. */
  score: number;
  /** Source-specific payload the dispatcher uses to act on the hit. */
  payload:
    | { kind: "journal"; noteId: string | null; ymd: string }
    | { kind: "note"; noteId: string }
    | { kind: "ticket"; ticketId: string }
    | { kind: "agent"; slug: string }
    | { kind: "commit"; url: string; sha: string };
}

const MAX_HITS_PER_KIND = 8;
const SNIPPET_RADIUS = 36;

// ─── Scoring primitives ─────────────────────────────────────────────────

/**
 * Return a score in [0,1] for `query` against `haystack`, and the position of
 * the best match (or -1). Higher score = better hit.
 *
 *   contiguous case-insensitive substring        → 0.7..1.0 (earlier = higher)
 *   subsequence (all query chars present in order) → 0.2..0.6
 *   no match                                     → 0
 */
function scoreText(query: string, haystack: string): { score: number; at: number } {
  if (!query) return { score: 0, at: -1 };
  if (!haystack) return { score: 0, at: -1 };
  const q = query.toLowerCase();
  const h = haystack.toLowerCase();

  const idx = h.indexOf(q);
  if (idx >= 0) {
    // Earlier position scores higher. Cap distance influence so a long body
    // with a late match still beats no match at all.
    const positional = 1 - Math.min(idx, 200) / 400; // 1.0 → 0.5
    return { score: 0.7 + 0.3 * positional, at: idx };
  }

  // Subsequence fallback. Walk q through h; track first-match position.
  let qi = 0;
  let firstAt = -1;
  for (let i = 0; i < h.length && qi < q.length; i++) {
    if (h[i] === q[qi]) {
      if (firstAt < 0) firstAt = i;
      qi++;
    }
  }
  if (qi !== q.length) return { score: 0, at: -1 };
  const density = q.length / Math.max(h.length, q.length);
  return { score: 0.2 + 0.4 * density, at: firstAt };
}

function makeSnippet(body: string, at: number, query: string): string {
  if (at < 0) return "";
  const start = Math.max(0, at - SNIPPET_RADIUS);
  const end = Math.min(body.length, at + query.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  return prefix + body.slice(start, end).replace(/\s+/g, " ") + suffix;
}

/**
 * Combine a title score and body score. Title wins when both match; body
 * is a fallback that gets a smaller weight. Recency nudges ties.
 */
function combine(
  titleHit: { score: number; at: number },
  bodyHit: { score: number; at: number },
  updatedAt: string | undefined,
): number {
  const title = titleHit.score;
  const body = bodyHit.score;
  // Title >> body. A body-only match maxes at ~0.5 even with a perfect body
  // substring, so title hits always sort above.
  const base = title > 0 ? 0.5 + 0.5 * title : 0.5 * body;
  if (base === 0) return 0;
  // Recency tiebreaker: up to +0.02 for "edited today".
  const recency = freshness(updatedAt);
  return Math.min(1, base + 0.02 * recency);
}

function freshness(iso: string | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  const ageDays = (Date.now() - t) / (24 * 60 * 60 * 1000);
  if (ageDays <= 0) return 1;
  if (ageDays >= 30) return 0;
  return 1 - ageDays / 30;
}

// ─── Source: notes (including journals) ─────────────────────────────────

export function searchNotes(query: string, notes: Note[]): SearchHit[] {
  if (!query.trim()) return [];
  const hits: SearchHit[] = [];
  for (const note of notes) {
    const ymd = journalYMDFromPath(note.path);
    const title = ymd ?? noteTitle(note);
    const titleHit = scoreText(query, title);
    const bodyHit = scoreText(query, note.body);
    const score = combine(titleHit, bodyHit, note.updatedAt);
    if (score === 0) continue;
    const at = titleHit.at >= 0 ? -1 : bodyHit.at;
    hits.push({
      kind: ymd ? "journal" : "note",
      key: `${ymd ? "j" : "n"}:${note.id}`,
      title,
      subtitle: ymd
        ? "Journal"
        : note.folder
          ? note.folder
          : "Notes",
      snippet: at >= 0 ? makeSnippet(note.body, at, query) : undefined,
      score,
      payload: ymd
        ? { kind: "journal", noteId: note.id, ymd }
        : { kind: "note", noteId: note.id },
    });
  }
  return topN(hits);
}

// ─── Source: tickets ────────────────────────────────────────────────────

export function searchTickets(query: string, tickets: Ticket[]): SearchHit[] {
  if (!query.trim()) return [];
  const hits: SearchHit[] = [];
  for (const ticket of tickets) {
    const titleHit = scoreText(query, ticket.title);
    const bodyHit = scoreText(query, ticket.body);
    const labelHit = ticket.labels.length
      ? scoreText(query, ticket.labels.join(" "))
      : { score: 0, at: -1 };
    // Treat a label match like a weak title match.
    const effectiveTitle =
      titleHit.score >= labelHit.score
        ? titleHit
        : { score: labelHit.score * 0.85, at: -1 };
    const score = combine(effectiveTitle, bodyHit, ticket.updatedAt);
    if (score === 0) continue;
    const subtitleParts: string[] = [ticket.status];
    if (ticket.dueDate) subtitleParts.push(`due ${ticket.dueDate}`);
    if (ticket.labels.length) subtitleParts.push(ticket.labels.join(", "));
    hits.push({
      kind: "ticket",
      key: `t:${ticket.id}`,
      title: ticket.title,
      subtitle: subtitleParts.join(" · "),
      snippet:
        bodyHit.at >= 0 ? makeSnippet(ticket.body, bodyHit.at, query) : undefined,
      score,
      payload: { kind: "ticket", ticketId: ticket.id },
    });
  }
  return topN(hits);
}

// ─── Source: agents (already fetched into a list) ───────────────────────

export function searchAgents(query: string, agents: AgentProfile[]): SearchHit[] {
  if (!query.trim()) return [];
  const hits: SearchHit[] = [];
  for (const agent of agents) {
    const titleHit = scoreText(query, agent.name);
    const slugHit = scoreText(query, agent.slug);
    const descHit = scoreText(query, agent.description);
    const effectiveTitle =
      titleHit.score >= slugHit.score ? titleHit : slugHit;
    const score = combine(effectiveTitle, descHit, agent.createdAt);
    if (score === 0) continue;
    hits.push({
      kind: "agent",
      key: `a:${agent.slug}`,
      title: agent.name,
      subtitle: agent.email,
      snippet:
        descHit.at >= 0 ? makeSnippet(agent.description, descHit.at, query) : undefined,
      score,
      payload: { kind: "agent", slug: agent.slug },
    });
  }
  return topN(hits);
}

// ─── Source: commits (fetched list) ─────────────────────────────────────

export function searchCommits(query: string, commits: VaultCommit[]): SearchHit[] {
  if (!query.trim()) return [];
  const hits: SearchHit[] = [];
  for (const commit of commits) {
    const msgHit = scoreText(query, commit.message);
    const authorHit = scoreText(query, commit.authorName ?? commit.authorLogin ?? "");
    const effectiveTitle =
      msgHit.score >= authorHit.score
        ? msgHit
        : { score: authorHit.score * 0.7, at: -1 };
    const score = combine(effectiveTitle, { score: 0, at: -1 }, commit.authoredAt);
    if (score === 0) continue;
    const firstLine = commit.message.split("\n", 1)[0] ?? commit.message;
    const author = commit.authorName ?? commit.authorLogin ?? "unknown";
    hits.push({
      kind: "commit",
      key: `c:${commit.sha}`,
      title: firstLine,
      subtitle: `${commit.sha.slice(0, 7)} · ${author}`,
      score,
      payload: { kind: "commit", url: commit.url, sha: commit.sha },
    });
  }
  return topN(hits);
}

function topN(hits: SearchHit[]): SearchHit[] {
  return hits.sort((a, b) => b.score - a.score).slice(0, MAX_HITS_PER_KIND);
}
