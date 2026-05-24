import { useEffect, useMemo, useState } from "react";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { useMembersStore } from "../stores/membersStore";
import { noteTitle } from "../lib/note-display";
import { resolveAssignee } from "../lib/members";
import type { Note } from "../types/note";
import type { Ticket } from "../types/ticket";

const WIDTH = 1000;
const HEIGHT = 600;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;
const OUTER_RADIUS = Math.min(WIDTH, HEIGHT) / 2 - 80;

/**
 * Node kinds rendered in the typed graph. `note` and `ticket` are "items"
 * — placed on the outer ring. `project` and `member` are "hubs" — placed
 * at the centroid of their connected items so the graph reads as
 * clusters around each hub.
 */
type NodeKind = "note" | "ticket" | "project" | "member";

interface GraphNode {
  id: string;        // unique across kinds (we prefix to avoid collisions)
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  degree: number;
  /** For note/ticket: the underlying id used by click handlers. */
  refId?: string;
  /** For member nodes only: user vs agent (changes the glyph). */
  memberKind?: "user" | "agent" | "legacy";
  /** Notes only — render a 🔒 prefix in the label. */
  encrypted?: boolean;
}

/**
 * Edge types carry stroke + opacity semantics in CSS.
 *
 *   wikilink     — note ↔ note via `[[wikilink]]` matches (existing behavior)
 *   creator      — solid line from a member to a note/ticket they created
 *   collaborator — dashed line from a member to a note/ticket they touch
 *   project      — thin tie from a project hub to its members
 *   linked       — ticket ↔ note via `ticket.linkedNotes`
 */
type EdgeKind = "wikilink" | "creator" | "collaborator" | "project" | "linked";

interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/** Frontmatter key → string array. Tolerates a single string. */
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

/**
 * Resolve a member ref ("user:foo" / "agent:bar") to a stable graph node
 * id. We namespace by kind so a user id and an agent id can coexist
 * without colliding.
 */
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

/**
 * Project for a note. Explicit `frontmatter.project` wins; otherwise we
 * fall back to the top-level folder name. Returns null when neither is
 * set, which means "no project" — these notes don't attach to a project
 * hub at all (rather than landing in a synthetic "untitled" hub that
 * would clutter the graph).
 */
function projectForNote(note: Note): string | null {
  const explicit = readStringField(note.frontmatter?.project);
  if (explicit) return explicit;
  if (note.folder) {
    const top = note.folder.split("/")[0]?.trim();
    if (top) return top;
  }
  return null;
}

/** Tickets don't have folders — only the explicit frontmatter equivalent. */
function projectForTicket(t: Ticket): string | null {
  // Tickets don't currently parse arbitrary frontmatter into the type,
  // so this is a no-op for now. Kept as a seam so when Phase 3 adds
  // `project` to Ticket the graph picks it up without a code change here.
  void t;
  return null;
}

interface FilterState {
  notes: boolean;
  tickets: boolean;
  projects: boolean;
  members: boolean;
}

const DEFAULT_FILTER: FilterState = {
  notes: true,
  tickets: true,
  projects: true,
  members: true,
};

export function GraphView() {
  const notes = useNotesStore((s) => s.all());
  const tickets = useTicketsStore((s) => s.all());
  const setActiveNote = useNotesStore((s) => s.setActive);
  const membersStatus = useMembersStore((s) => s.status);
  const memberList = useMembersStore((s) => s.members);
  const loadMembers = useMembersStore((s) => s.load);

  const [hover, setHover] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER);

  useEffect(() => {
    if (membersStatus === "idle") void loadMembers();
  }, [membersStatus, loadMembers]);

  const { nodes, edges, stats } = useMemo(
    () => buildGraph({ notes, tickets, members: memberList, filters }),
    [notes, tickets, memberList, filters],
  );

  if (notes.length === 0 && tickets.length === 0) {
    return (
      <div className="nk-empty nk-empty--center">
        <p>No notes or tickets to graph yet.</p>
        <p className="nk-empty-hint">
          Add a few items and connect them with{" "}
          <code style={{ fontFamily: "var(--mono-font)" }}>[[wikilinks]]</code>,
          frontmatter <code>creator:</code> /{" "}
          <code>collaborators:</code>, or a folder per project.
        </p>
      </div>
    );
  }

  const nodeIndex = new Map(nodes.map((n) => [n.id, n]));

  function onClickNode(n: GraphNode) {
    if (n.kind === "note" && n.refId) setActiveNote(n.refId);
    // Tickets/projects/members aren't navigable yet — filter chips are
    // the way to focus a subgraph in Phase 1.
  }

  return (
    <div className="nk-graph">
      <div className="nk-graph-filters" role="toolbar" aria-label="Filter graph">
        <FilterChip
          label="Notes"
          active={filters.notes}
          count={stats.notes}
          color="note"
          onToggle={() =>
            setFilters((f) => ({ ...f, notes: !f.notes }))
          }
        />
        <FilterChip
          label="Tickets"
          active={filters.tickets}
          count={stats.tickets}
          color="ticket"
          onToggle={() =>
            setFilters((f) => ({ ...f, tickets: !f.tickets }))
          }
        />
        <FilterChip
          label="Projects"
          active={filters.projects}
          count={stats.projects}
          color="project"
          onToggle={() =>
            setFilters((f) => ({ ...f, projects: !f.projects }))
          }
        />
        <FilterChip
          label="Members"
          active={filters.members}
          count={stats.members}
          color="member"
          onToggle={() =>
            setFilters((f) => ({ ...f, members: !f.members }))
          }
        />
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        {edges.map((e, i) => {
          const a = nodeIndex.get(e.from);
          const b = nodeIndex.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={`e${i}`}
              className={`nk-graph-edge nk-graph-edge--${e.kind}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        })}
        {nodes.map((n) => {
          const r = nodeRadius(n);
          const isHover = hover === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onClickNode(n)}
              style={{ cursor: n.kind === "note" ? "pointer" : "default" }}
            >
              <circle
                className={
                  `nk-graph-node nk-graph-node--${n.kind}` +
                  (n.degree >= 2 ? " hub" : "") +
                  (n.encrypted ? " encrypted" : "") +
                  (n.kind === "member" && n.memberKind === "agent" ? " agent" : "")
                }
                r={r}
              />
              <text
                className="nk-graph-label"
                y={r + 14}
                style={{ fontWeight: isHover ? 600 : 400 }}
              >
                {labelFor(n)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="nk-graph-legend">
        <div>
          <b>{stats.notes}</b> notes · <b>{stats.tickets}</b> tickets ·{" "}
          <b>{stats.projects}</b> projects · <b>{stats.members}</b> members
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
          Solid edge = creator · dashed = collaborator · click a note to open
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  count,
  color,
  onToggle,
}: {
  label: string;
  active: boolean;
  count: number;
  color: NodeKind;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      className={
        `nk-graph-chip nk-graph-chip--${color}` + (active ? " active" : "")
      }
      aria-pressed={active}
      onClick={onToggle}
    >
      {label}
      <span className="nk-graph-chip-count">{count}</span>
    </button>
  );
}

function nodeRadius(n: GraphNode): number {
  // Hubs scale with their connection count, capped so a popular project
  // doesn't eat the canvas. Items keep the existing degree-based scale.
  if (n.kind === "project") return 14 + Math.min(n.degree, 12);
  if (n.kind === "member") return 11 + Math.min(n.degree, 10);
  return 8 + Math.min(n.degree * 2, 14);
}

function labelFor(n: GraphNode): string {
  const lock = n.encrypted ? "🔒 " : "";
  const agentTag = n.kind === "member" && n.memberKind === "agent" ? "🤖 " : "";
  const text = n.label.length > 26 ? n.label.slice(0, 25) + "…" : n.label;
  return `${lock}${agentTag}${text}`;
}

// ── Graph build ──────────────────────────────────────────────────────────

interface BuildArgs {
  notes: Note[];
  tickets: Ticket[];
  members: { kind: "user" | "agent"; id: string; name: string }[];
  filters: FilterState;
}

interface BuildResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { notes: number; tickets: number; projects: number; members: number };
}

function buildGraph(args: BuildArgs): BuildResult {
  const { notes, tickets, members, filters } = args;

  // Layout — items on the outer ring, hubs at centroid (computed below).
  const items: { id: string; node: GraphNode }[] = [];
  const memberHubs = new Map<string, GraphNode>();
  const projectHubs = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();

  function bump(id: string) {
    degree.set(id, (degree.get(id) ?? 0) + 1);
  }
  function edge(from: string, to: string, kind: EdgeKind) {
    edges.push({ from, to, kind });
    bump(from);
    bump(to);
  }

  // — Note item nodes —
  const noteIdToNodeId = new Map<string, string>();
  const byTitle = new Map<string, string>();
  if (filters.notes) {
    for (const n of notes) {
      const t = noteTitle(n);
      const nodeId = `note:${n.id}`;
      noteIdToNodeId.set(n.id, nodeId);
      byTitle.set(t.toLowerCase(), nodeId);
      const node: GraphNode = {
        id: nodeId,
        kind: "note",
        label: t || "Untitled",
        x: 0, y: 0, degree: 0,
        refId: n.id,
        encrypted: !!n.encrypted,
      };
      items.push({ id: nodeId, node });
    }
  }

  // — Ticket item nodes —
  const ticketIdToNodeId = new Map<string, string>();
  if (filters.tickets) {
    for (const t of tickets) {
      const nodeId = `ticket:${t.id}`;
      ticketIdToNodeId.set(t.id, nodeId);
      const node: GraphNode = {
        id: nodeId,
        kind: "ticket",
        label: t.title || "Untitled ticket",
        x: 0, y: 0, degree: 0,
        refId: t.id,
        encrypted: !!t.encrypted,
      };
      items.push({ id: nodeId, node });
    }
  }

  // — Wikilink edges (existing behavior) —
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

  // — Ticket → linkedNotes —
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

  // — Member hubs + creator/collaborator edges —
  function ensureMember(ref: string): string | null {
    const nodeId = memberNodeId(ref);
    if (!nodeId) return null;
    if (memberHubs.has(nodeId)) return nodeId;
    const resolved = resolveAssignee(ref, members);
    const label = resolved?.display ?? ref;
    const mkind = resolved?.kind ?? "legacy";
    memberHubs.set(nodeId, {
      id: nodeId,
      kind: "member",
      label,
      x: 0, y: 0, degree: 0,
      memberKind: mkind,
    });
    return nodeId;
  }

  if (filters.members) {
    for (const n of notes) {
      const fromId = noteIdToNodeId.get(n.id);
      if (!fromId) continue;
      const creatorRef = readStringField(n.frontmatter?.creator);
      if (creatorRef) {
        const mId = ensureMember(creatorRef);
        if (mId) edge(mId, fromId, "creator");
      }
      for (const coRef of readMemberList(n.frontmatter?.collaborators)) {
        // Skip a collaborator entry that duplicates the creator — the
        // graph already shows that tie as a creator edge.
        if (creatorRef && coRef === creatorRef) continue;
        const mId = ensureMember(coRef);
        if (mId) edge(mId, fromId, "collaborator");
      }
    }
    for (const t of tickets) {
      const fromId = ticketIdToNodeId.get(t.id);
      if (!fromId) continue;
      if (t.createdBy) {
        const mId = ensureMember(t.createdBy);
        if (mId) edge(mId, fromId, "creator");
      }
      if (t.assignee && t.assignee !== t.createdBy) {
        const mId = ensureMember(t.assignee);
        if (mId) edge(mId, fromId, "collaborator");
      }
    }
  }

  // — Project hubs —
  function ensureProject(name: string): string {
    const nodeId = `project:${name}`;
    if (!projectHubs.has(nodeId)) {
      projectHubs.set(nodeId, {
        id: nodeId,
        kind: "project",
        label: name,
        x: 0, y: 0, degree: 0,
      });
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
    for (const t of tickets) {
      const fromId = ticketIdToNodeId.get(t.id);
      if (!fromId) continue;
      const p = projectForTicket(t);
      if (p) edge(ensureProject(p), fromId, "project");
    }
  }

  // — Layout —
  // Items on the outer ring, in insertion order. Hubs at the centroid of
  // their connected items (one pass — good enough for ~hundreds of nodes;
  // a force sim would be cleaner but pulls in a dep we don't want yet).
  layoutItems(items.map((i) => i.node));
  const itemPos = new Map(items.map((i) => [i.id, { x: i.node.x, y: i.node.y }]));
  const allHubs = [...memberHubs.values(), ...projectHubs.values()];
  layoutHubs(allHubs, edges, itemPos);

  // Stamp degree onto nodes for sizing.
  const allNodes: GraphNode[] = [
    ...items.map((i) => i.node),
    ...allHubs,
  ];
  for (const n of allNodes) n.degree = degree.get(n.id) ?? 0;

  return {
    nodes: allNodes,
    edges,
    stats: {
      notes: items.filter((i) => i.node.kind === "note").length,
      tickets: items.filter((i) => i.node.kind === "ticket").length,
      projects: projectHubs.size,
      members: memberHubs.size,
    },
  };
}

function layoutItems(items: GraphNode[]) {
  const count = items.length;
  for (let i = 0; i < count; i++) {
    const angle = count === 0 ? 0 : (i / count) * Math.PI * 2 - Math.PI / 2;
    items[i]!.x = CENTER_X + Math.cos(angle) * OUTER_RADIUS;
    items[i]!.y = CENTER_Y + Math.sin(angle) * OUTER_RADIUS;
  }
}

function layoutHubs(
  hubs: GraphNode[],
  edges: GraphEdge[],
  itemPos: Map<string, { x: number; y: number }>,
) {
  // Group edges by hub so each hub's centroid is the mean of its items'
  // positions. Hubs with no item connections (filtered out by mismatch)
  // land at canvas center — rare and OK as a fallback.
  const connections = new Map<string, { x: number; y: number }[]>();
  for (const e of edges) {
    const pickHub = itemPos.has(e.from) ? e.to : e.from;
    const pickItem = itemPos.has(e.from) ? e.from : e.to;
    const pos = itemPos.get(pickItem);
    if (!pos) continue;
    if (!connections.has(pickHub)) connections.set(pickHub, []);
    connections.get(pickHub)!.push(pos);
  }
  for (const h of hubs) {
    const pts = connections.get(h.id);
    if (!pts || pts.length === 0) {
      h.x = CENTER_X;
      h.y = CENTER_Y;
      continue;
    }
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; }
    h.x = sx / pts.length;
    h.y = sy / pts.length;
  }
}
