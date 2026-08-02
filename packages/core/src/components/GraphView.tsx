import { useEffect, useMemo, useRef, useState } from "react";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { useMembersStore } from "../stores/membersStore";
import { useCryptoStore } from "../stores/cryptoStore";
import { noteTitle } from "../lib/note-display";
import { resolveAssignee } from "../lib/members";
import type { Note } from "../types/note";
import type { Ticket } from "../types/ticket";

const WIDTH = 1000;
const HEIGHT = 640;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;

type NodeKind = "note" | "ticket" | "project" | "member";
type EdgeKind = "wikilink" | "creator" | "collaborator" | "project" | "linked";

interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number;
  y: number;
  degree: number;
  refId?: string;
  memberKind?: "user" | "agent" | "legacy";
  encrypted?: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

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

function projectForTicket(t: Ticket): string | null {
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

// ── Force-directed simulation ──────────────────────────────────────────────

function runForce(
  nodes: GraphNode[],
  edges: GraphEdge[],
  iterations = 280,
): void {
  if (nodes.length === 0) return;

  // Seed positions in a circle for deterministic start.
  const n = nodes.length;
  const r0 = Math.min(WIDTH, HEIGHT) * 0.3;
  nodes.forEach((nd, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    nd.x = CX + Math.cos(angle) * r0;
    nd.y = CY + Math.sin(angle) * r0;
  });

  const REPULSION = 3500;
  const SPRING_K = 0.06;
  const SPRING_REST = 90;
  const GRAVITY = 0.008;
  const PAD = 50;

  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = Math.max(0.01, 1 - iter / iterations);
    vx.fill(0);
    vy.fill(0);

    // Repulsion between all pairs (Barnes–Hut would scale better, but n<200).
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = nodes[j]!.x - nodes[i]!.x;
        const dy = nodes[j]!.y - nodes[i]!.y;
        const d2 = dx * dx + dy * dy + 1;
        const f = REPULSION / d2;
        const d = Math.sqrt(d2);
        vx[i]! -= (dx / d) * f;
        vy[i]! -= (dy / d) * f;
        vx[j]! += (dx / d) * f;
        vy[j]! += (dy / d) * f;
      }
    }

    // Spring attraction along edges.
    for (const e of edges) {
      const ai = idx.get(e.from);
      const bi = idx.get(e.to);
      if (ai == null || bi == null) continue;
      const dx = nodes[bi]!.x - nodes[ai]!.x;
      const dy = nodes[bi]!.y - nodes[ai]!.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const f = SPRING_K * (d - SPRING_REST);
      vx[ai]! += (dx / d) * f;
      vy[ai]! += (dy / d) * f;
      vx[bi]! -= (dx / d) * f;
      vy[bi]! -= (dy / d) * f;
    }

    // Gravity toward center.
    for (let i = 0; i < n; i++) {
      vx[i]! += (CX - nodes[i]!.x) * GRAVITY;
      vy[i]! += (CY - nodes[i]!.y) * GRAVITY;
    }

    // Integrate and clamp.
    for (let i = 0; i < n; i++) {
      nodes[i]!.x = Math.max(PAD, Math.min(WIDTH - PAD, nodes[i]!.x + vx[i]! * alpha));
      nodes[i]!.y = Math.max(PAD, Math.min(HEIGHT - PAD, nodes[i]!.y + vy[i]! * alpha));
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export function GraphView() {
  const notes = useNotesStore((s) => s.all());
  const tickets = useTicketsStore((s) => s.all());
  const encryptionRequired = useCryptoStore((s) => s.encryptionRequired);
  const setActiveNote = useNotesStore((s) => s.setActive);
  const membersStatus = useMembersStore((s) => s.status);
  const memberList = useMembersStore((s) => s.members);
  const loadMembers = useMembersStore((s) => s.load);

  const [hover, setHover] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER);
  // drag-to-pan
  const panRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (membersStatus === "idle") void loadMembers();
  }, [membersStatus, loadMembers]);

  const { nodes, edges, stats } = useMemo(
    () => buildGraph({ notes, tickets, members: memberList, filters }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, tickets, memberList, filters],
  );

  // Hover neighbours
  const hoveredSet = useMemo(() => {
    if (!hover) return null;
    const s = new Set<string>([hover]);
    for (const e of edges) {
      if (e.from === hover) s.add(e.to);
      if (e.to === hover) s.add(e.from);
    }
    return s;
  }, [hover, edges]);

  if (notes.length === 0 && tickets.length === 0) {
    return (
      <div className="nk-empty nk-empty--center">
        <p>No notes or tickets to graph yet.</p>
        <p className="nk-empty-hint">
          Add a few items and connect them with{" "}
          <code style={{ fontFamily: "var(--mono-font)" }}>[[wikilinks]]</code>,
          frontmatter <code>creator:</code> / <code>collaborators:</code>, or a folder per project.
        </p>
      </div>
    );
  }

  const nodeIndex = new Map(nodes.map((n) => [n.id, n]));

  function onClickNode(n: GraphNode) {
    if (n.kind === "note" && n.refId) setActiveNote(n.refId);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setScale((s) => Math.max(0.3, Math.min(3, s * (e.deltaY > 0 ? 0.9 : 1.1))));
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, ox: pan.x, oy: pan.y };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!panRef.current) return;
    setPan({
      x: panRef.current.ox + (e.clientX - panRef.current.startX),
      y: panRef.current.oy + (e.clientY - panRef.current.startY),
    });
  }
  function onMouseUp() { panRef.current = null; }

  return (
    <div className="nk-graph">
      <div className="nk-graph-filters" role="toolbar" aria-label="Filter graph">
        <FilterChip label="Notes" active={filters.notes} count={stats.notes} color="note"
          onToggle={() => setFilters((f) => ({ ...f, notes: !f.notes }))} />
        <FilterChip label="Tickets" active={filters.tickets} count={stats.tickets} color="ticket"
          onToggle={() => setFilters((f) => ({ ...f, tickets: !f.tickets }))} />
        <FilterChip label="Projects" active={filters.projects} count={stats.projects} color="project"
          onToggle={() => setFilters((f) => ({ ...f, projects: !f.projects }))} />
        <FilterChip label="Members" active={filters.members} count={stats.members} color="member"
          onToggle={() => setFilters((f) => ({ ...f, members: !f.members }))} />
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ cursor: panRef.current ? "grabbing" : "grab" }}
      >
        <g transform={`translate(${pan.x + CX * (1 - scale)},${pan.y + CY * (1 - scale)}) scale(${scale})`}>

          {/* Edges — render before nodes so nodes sit on top */}
          {edges.map((e, i) => {
            const a = nodeIndex.get(e.from);
            const b = nodeIndex.get(e.to);
            if (!a || !b) return null;
            const isConnected =
              hoveredSet && (hoveredSet.has(e.from) && hoveredSet.has(e.to));
            const dimmed = hoveredSet && !isConnected;
            return (
              <line
                key={`e${i}`}
                className={`nk-graph-edge nk-graph-edge--${e.kind}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                style={{
                  opacity: dimmed ? 0.05 : isConnected ? 1 : undefined,
                  stroke: isConnected ? "var(--accent)" : undefined,
                  strokeWidth: isConnected ? 1.5 : undefined,
                  transition: "opacity 0.12s, stroke 0.12s",
                }}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            const r = nodeRadius(n);
            const isHovered = hover === n.id;
            const isNeighbor = hoveredSet ? hoveredSet.has(n.id) : false;
            const dimmed = hoveredSet && !isNeighbor;
            const highlighted = isNeighbor && !isHovered;
            const label = labelFor(n, encryptionRequired);
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onClickNode(n)}
                style={{
                  cursor: n.kind === "note" ? "pointer" : "default",
                  opacity: dimmed ? 0.12 : 1,
                  transition: "opacity 0.12s",
                }}
              >
                <circle
                  className={[
                    "nk-graph-node",
                    `nk-graph-node--${n.kind}`,
                    n.degree >= 3 ? "hub" : "",
                    n.encrypted && !encryptionRequired ? "encrypted" : "",
                    n.kind === "member" && n.memberKind === "agent" ? "agent" : "",
                    isHovered ? "hovered" : "",
                    highlighted ? "neighbor" : "",
                  ].filter(Boolean).join(" ")}
                  r={isHovered ? r + 2 : r}
                />
                <text
                  className="nk-graph-label"
                  y={r + 14}
                  style={{
                    fontWeight: isHovered ? 700 : isNeighbor ? 600 : 400,
                    fill: isHovered
                      ? "var(--text)"
                      : isNeighbor
                      ? "var(--text-2)"
                      : undefined,
                    fontSize: isHovered ? 11.5 : undefined,
                  }}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="nk-graph-legend">
        <div>
          <b>{stats.notes}</b> notes · <b>{stats.tickets}</b> tickets ·{" "}
          <b>{stats.projects}</b> projects · <b>{stats.members}</b> members
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
          Click a note to open · scroll to zoom · drag to pan
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function FilterChip({
  label, active, count, color, onToggle,
}: {
  label: string; active: boolean; count: number; color: NodeKind; onToggle(): void;
}) {
  return (
    <button
      type="button"
      className={`nk-graph-chip nk-graph-chip--${color}` + (active ? " active" : "")}
      aria-pressed={active}
      onClick={onToggle}
    >
      {label}
      <span className="nk-graph-chip-count">{count}</span>
    </button>
  );
}

function nodeRadius(n: GraphNode): number {
  // Scale with degree: hub nodes get bigger, leaf nodes stay small.
  const base = n.kind === "project" ? 10 : n.kind === "member" ? 9 : 6;
  return base + Math.sqrt(Math.max(0, n.degree)) * 2.5;
}

function labelFor(n: GraphNode, encryptionRequired: boolean): string {
  const lock = n.encrypted && !encryptionRequired ? "🔒 " : "";
  const agentTag = n.kind === "member" && n.memberKind === "agent" ? "🤖 " : "";
  const text = n.label.length > 24 ? n.label.slice(0, 23) + "…" : n.label;
  return `${lock}${agentTag}${text}`;
}

// ── Graph build ────────────────────────────────────────────────────────────

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

  const allNodes: GraphNode[] = [];
  const memberHubs = new Map<string, GraphNode>();
  const projectHubs = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();

  function bump(id: string) { degree.set(id, (degree.get(id) ?? 0) + 1); }
  function edge(from: string, to: string, kind: EdgeKind) {
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
      const node: GraphNode = {
        id: nodeId, kind: "note", label: t || "Untitled",
        x: 0, y: 0, degree: 0, refId: n.id, encrypted: !!n.encrypted,
      };
      allNodes.push(node);
    }
  }

  const ticketIdToNodeId = new Map<string, string>();
  if (filters.tickets) {
    for (const t of tickets) {
      const nodeId = `ticket:${t.id}`;
      ticketIdToNodeId.set(t.id, nodeId);
      const node: GraphNode = {
        id: nodeId, kind: "ticket", label: t.title || "Untitled ticket",
        x: 0, y: 0, degree: 0, refId: t.id, encrypted: !!t.encrypted,
      };
      allNodes.push(node);
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
    const label = resolved?.display ?? ref;
    const mkind = resolved?.kind ?? "legacy";
    const node: GraphNode = { id: nodeId, kind: "member", label, x: 0, y: 0, degree: 0, memberKind: mkind };
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
        const mId = ensureMember(t.assignee);
        if (mId) edge(mId, fromId, "collaborator");
      }
    }
  }

  function ensureProject(name: string): string {
    const nodeId = `project:${name}`;
    if (!projectHubs.has(nodeId)) {
      const node: GraphNode = { id: nodeId, kind: "project", label: name, x: 0, y: 0, degree: 0 };
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
    for (const t of tickets) {
      const fromId = ticketIdToNodeId.get(t.id);
      if (!fromId) continue;
      const p = projectForTicket(t);
      if (p) edge(ensureProject(p), fromId, "project");
    }
  }

  // Stamp degrees.
  for (const n of allNodes) n.degree = degree.get(n.id) ?? 0;

  // Run force-directed layout (mutates x/y in place).
  runForce(allNodes, edges);

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
