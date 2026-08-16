import type { Note } from "../types/note";
import type { Ticket } from "../types/ticket";
import { resolveAssignee } from "./members";
import { noteTitle } from "./note-display";

// ── Graph data model ────────────────────────────────────────────────────────
//
// Pure data layer for the knowledge graph: turns notes/tickets/members into a
// generic { nodes, edges } shape. Deliberately renderer-agnostic — the PIXI
// view (or any other) consumes this without knowing how the graph is built.

export type NodeKind = "note" | "ticket" | "project" | "member";
export type EdgeKind = "wikilink" | "creator" | "collaborator" | "project" | "linked";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  degree: number;
  refId?: string;
  memberKind?: "user" | "agent" | "legacy";
  encrypted?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface FilterState {
  notes: boolean;
  tickets: boolean;
  projects: boolean;
  members: boolean;
}

export const DEFAULT_FILTER: FilterState = {
  notes: true,
  tickets: true,
  projects: false,
  members: false,
};

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

function readMemberList(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === "string") return raw.trim() ? [raw.trim()] : [];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) out.push(t);
  }
  return out;
}

function readStringField(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t || null;
}

function memberNodeId(ref: string): string | null {
  const t = ref.trim();
  if (!t) return null;
  const colon = t.indexOf(":");
  if (colon < 0) return `member:legacy:${t}`;
  const kind = t.slice(0, colon);
  const id = t.slice(colon + 1).trim();
  if ((kind === "user" || kind === "agent") && id) return `member:${kind}:${id}`;
  return `member:legacy:${t}`;
}

function projectForNote(note: Note): string | null {
  const explicit = readStringField(note.frontmatter?.project);
  if (explicit) return explicit;
  if (note.folder) {
    const top = note.folder.split("/")[0]?.trim();
    if (top) return top;
  }
  return null;
}

// Node radius as a function of connectivity — hubs render larger.
export function nodeRadius(n: GraphNode): number {
  const base = n.kind === "project" ? 5 : n.kind === "member" ? 4 : 4;
  return base + Math.sqrt(Math.max(0, n.degree)) * 1.4;
}

// Display label with lock / agent affordances, truncated for the canvas.
export function labelFor(n: GraphNode, encryptionRequired: boolean): string {
  const lock = n.encrypted && !encryptionRequired ? "🔒 " : "";
  const agentTag = n.kind === "member" && n.memberKind === "agent" ? "🤖 " : "";
  const text = n.label.length > 24 ? n.label.slice(0, 23) + "…" : n.label;
  return `${lock}${agentTag}${text}`;
}

export interface BuildArgs {
  notes: Note[];
  tickets: Ticket[];
  members: { kind: "user" | "agent"; id: string; name: string }[];
  filters: FilterState;
}

export interface BuildResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { notes: number; tickets: number; projects: number; members: number };
}

// eslint-disable-next-line max-lines-per-function, complexity -- graph builder is a single-pass algorithm; multiple filter/edge combinations make splitting impractical
export function buildGraph(args: BuildArgs): BuildResult {
  const { notes, tickets, members, filters } = args;

  const allNodes: GraphNode[] = [];
  const memberHubs = new Map<string, GraphNode>();
  const projectHubs = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();
  const edgeSeen = new Set<string>();

  function bump(id: string) { degree.set(id, (degree.get(id) ?? 0) + 1); }
  function edge(from: string, to: string, kind: EdgeKind) {
    // Deduplicate undirected pairs — A↔B and B↔A are the same visual line.
    const key = (from < to ? from + "\x00" + to : to + "\x00" + from) + "\x00" + kind;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push({ from, to, kind });
    bump(from); bump(to);
  }

  const noteIdToNodeId = new Map<string, string>();
  const byTitle = new Map<string, string>();
  if (filters.notes) {
    for (const n of notes) {
      const t = noteTitle(n);
      const nodeId = `note:${n.id}`;
      noteIdToNodeId.set(n.id, nodeId);
      byTitle.set(t.toLowerCase(), nodeId);
      allNodes.push({ id: nodeId, kind: "note", label: t || "Untitled", degree: 0, refId: n.id, encrypted: !!n.encrypted });
    }
  }

  const ticketIdToNodeId = new Map<string, string>();
  if (filters.tickets) {
    for (const t of tickets) {
      const nodeId = `ticket:${t.id}`;
      ticketIdToNodeId.set(t.id, nodeId);
      allNodes.push({ id: nodeId, kind: "ticket", label: t.title || "Untitled ticket", degree: 0, refId: t.id, encrypted: !!t.encrypted });
    }
  }

  if (filters.notes) {
    for (const n of notes) {
      const fromId = noteIdToNodeId.get(n.id);
      if (!fromId) continue;
      for (const m of n.body.matchAll(WIKILINK_RE)) {
        const target = m[1]?.trim().toLowerCase();
        if (!target) continue;
        const toId = byTitle.get(target);
        if (toId && toId !== fromId) edge(fromId, toId, "wikilink");
      }
    }
  }

  if (filters.tickets && filters.notes) {
    for (const t of tickets) {
      const fromId = ticketIdToNodeId.get(t.id);
      if (!fromId) continue;
      for (const noteId of t.linkedNotes) {
        const toId = noteIdToNodeId.get(noteId);
        if (toId) edge(fromId, toId, "linked");
      }
    }
  }

  function ensureMember(ref: string): string | null {
    const nodeId = memberNodeId(ref);
    if (!nodeId) return null;
    if (memberHubs.has(nodeId)) return nodeId;
    const resolved = resolveAssignee(ref, members);
    const node: GraphNode = { id: nodeId, kind: "member", label: resolved?.display ?? ref, degree: 0, memberKind: resolved?.kind ?? "legacy" };
    memberHubs.set(nodeId, node);
    allNodes.push(node);
    return nodeId;
  }

  if (filters.members) {
    for (const n of notes) {
      const fromId = noteIdToNodeId.get(n.id);
      if (!fromId) continue;
      const creatorRef = readStringField(n.frontmatter?.creator);
      if (creatorRef) { const mId = ensureMember(creatorRef); if (mId) edge(mId, fromId, "creator"); }
      for (const coRef of readMemberList(n.frontmatter?.collaborators)) {
        if (creatorRef && coRef === creatorRef) continue;
        const mId = ensureMember(coRef);
        if (mId) edge(mId, fromId, "collaborator");
      }
    }
    for (const t of tickets) {
      const fromId = ticketIdToNodeId.get(t.id);
      if (!fromId) continue;
      if (t.createdBy) { const mId = ensureMember(t.createdBy); if (mId) edge(mId, fromId, "creator"); }
      if (t.assignee && t.assignee !== t.createdBy) {
        const mId = ensureMember(t.assignee); if (mId) edge(mId, fromId, "collaborator");
      }
    }
  }

  function ensureProject(name: string): string {
    const nodeId = `project:${name}`;
    if (!projectHubs.has(nodeId)) {
      const node: GraphNode = { id: nodeId, kind: "project", label: name, degree: 0 };
      projectHubs.set(nodeId, node);
      allNodes.push(node);
    }
    return nodeId;
  }
  if (filters.projects) {
    for (const n of notes) {
      const fromId = noteIdToNodeId.get(n.id);
      if (!fromId) continue;
      const p = projectForNote(n);
      if (p) edge(ensureProject(p), fromId, "project");
    }
  }

  for (const n of allNodes) n.degree = degree.get(n.id) ?? 0;

  return {
    nodes: allNodes,
    edges,
    stats: {
      notes: allNodes.filter((n) => n.kind === "note").length,
      tickets: allNodes.filter((n) => n.kind === "ticket").length,
      projects: projectHubs.size,
      members: memberHubs.size,
    },
  };
}
