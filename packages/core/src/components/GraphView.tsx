import { useEffect, useMemo, useReducer, useRef, useState } from "react";
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

const YELLOW = "#f5c542";

type NodeKind = "note" | "ticket" | "project" | "member";
type EdgeKind = "wikilink" | "creator" | "collaborator" | "project" | "linked";

interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
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

// Simulation node — positions live here, separate from metadata.
interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
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

interface FilterState {
  notes: boolean;
  tickets: boolean;
  projects: boolean;
  members: boolean;
}

const DEFAULT_FILTER: FilterState = {
  notes: true,
  tickets: true,
  projects: false,
  members: false,
};

// ── Force sim (single step) ────────────────────────────────────────────────

function stepSim(
  sn: SimNode[],
  edges: GraphEdge[],
  alpha: number,
  pinned: { id: string; x: number; y: number } | null,
): void {
  const n = sn.length;
  if (n === 0) return;

  const REPULSION = 12000;
  const SPRING_K = 0.025;
  const SPRING_REST = 130;
  const GRAVITY = 0.005;
  const PAD = 50;
  const DAMP = 0.65;

  const idx = new Map(sn.map((s, i) => [s.id, i]));

  // Repulsion
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = sn[j]!.x - sn[i]!.x;
      const dy = sn[j]!.y - sn[i]!.y;
      const d2 = dx * dx + dy * dy + 1;
      const f = (REPULSION * alpha) / d2;
      const d = Math.sqrt(d2);
      const nx = (dx / d) * f;
      const ny = (dy / d) * f;
      sn[i]!.vx -= nx;
      sn[i]!.vy -= ny;
      sn[j]!.vx += nx;
      sn[j]!.vy += ny;
    }
  }

  // Spring
  for (const e of edges) {
    const ai = idx.get(e.from);
    const bi = idx.get(e.to);
    if (ai == null || bi == null) continue;
    const dx = sn[bi]!.x - sn[ai]!.x;
    const dy = sn[bi]!.y - sn[ai]!.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
    const f = SPRING_K * (d - SPRING_REST) * alpha;
    sn[ai]!.vx += (dx / d) * f;
    sn[ai]!.vy += (dy / d) * f;
    sn[bi]!.vx -= (dx / d) * f;
    sn[bi]!.vy -= (dy / d) * f;
  }

  // Gravity
  for (const s of sn) {
    s.vx += (CX - s.x) * GRAVITY * alpha;
    s.vy += (CY - s.y) * GRAVITY * alpha;
  }

  // Integrate
  for (const s of sn) {
    if (pinned && s.id === pinned.id) {
      s.x = pinned.x;
      s.y = pinned.y;
      s.vx = 0;
      s.vy = 0;
    } else {
      s.vx *= DAMP;
      s.vy *= DAMP;
      s.x = Math.max(PAD, Math.min(WIDTH - PAD, s.x + s.vx));
      s.y = Math.max(PAD, Math.min(HEIGHT - PAD, s.y + s.vy));
    }
  }
}

function initSim(n: number): SimNode[] {
  // Deterministic circle seed
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      id: "",
      x: CX + Math.cos(angle) * 280,
      y: CY + Math.sin(angle) * 280,
      vx: 0,
      vy: 0,
    };
  });
}

// ── Component ──────────────────────────────────────────────────────────────

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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  // Render trigger for RAF loop
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const alphaRef = useRef(1.0);
  const rafRef = useRef<number | null>(null);
  const pinnedRef = useRef<{ id: string; x: number; y: number } | null>(null);
  // pan drag
  const panDragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  // node drag tracking
  const nodeDragRef = useRef<string | null>(null);

  useEffect(() => {
    if (membersStatus === "idle") void loadMembers();
  }, [membersStatus, loadMembers]);

  const { nodes, edges, stats } = useMemo(
    () => buildGraph({ notes, tickets, members: memberList, filters }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, tickets, memberList, filters],
  );

  // Re-seed simulation whenever the node list changes.
  useEffect(() => {
    const seed = initSim(nodes.length);
    seed.forEach((s, i) => { s.id = nodes[i]!.id; });
    simRef.current = seed;
    alphaRef.current = 1.0;
  }, [nodes]);

  // Continuous RAF loop.
  useEffect(() => {
    function loop() {
      const alpha = alphaRef.current;
      if (alpha > 0.003 || pinnedRef.current) {
        stepSim(simRef.current, edges, Math.min(alpha, 0.3), pinnedRef.current);
        if (!pinnedRef.current) alphaRef.current *= 0.97;
        rerender();
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [edges]);

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
          <code style={{ fontFamily: "var(--mono-font)" }}>[[wikilinks]]</code>.
        </p>
      </div>
    );
  }

  // Build position lookup from live sim
  const posMap = new Map(simRef.current.map((s) => [s.id, { x: s.x, y: s.y }]));

  // Convert client (screen) coords → node-space coords
  function clientToNode(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const rect = svg.getBoundingClientRect();
    // viewBox scale (preserveAspectRatio: meet)
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    const vs = Math.max(scaleX, scaleY); // "meet" takes the larger
    const ox = (rect.width - WIDTH / vs) / 2;
    const oy = (rect.height - HEIGHT / vs) / 2;
    const svgX = (clientX - rect.left - ox) * vs;
    const svgY = (clientY - rect.top - oy) * vs;
    // Undo the g transform: translate(pan.x + CX*(1-scale), ...) scale(scale)
    const tx = pan.x + CX * (1 - scale);
    const ty = pan.y + CY * (1 - scale);
    return {
      x: (svgX - tx) / scale,
      y: (svgY - ty) / scale,
    };
  }

  function onSvgMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    // Only pan when not dragging a node
    panDragRef.current = { startX: e.clientX, startY: e.clientY, ox: pan.x, oy: pan.y };
  }

  function onSvgMouseMove(e: React.MouseEvent) {
    if (nodeDragRef.current) {
      const pos = clientToNode(e.clientX, e.clientY);
      pinnedRef.current = { id: nodeDragRef.current, ...pos };
      alphaRef.current = Math.max(alphaRef.current, 0.3);
      return;
    }
    if (!panDragRef.current) return;
    setPan({
      x: panDragRef.current.ox + (e.clientX - panDragRef.current.startX),
      y: panDragRef.current.oy + (e.clientY - panDragRef.current.startY),
    });
  }

  function onSvgMouseUp() {
    panDragRef.current = null;
    nodeDragRef.current = null;
    pinnedRef.current = null;
    // Let the sim cool again from current alpha
    alphaRef.current = Math.max(alphaRef.current, 0.1);
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setScale((s) => Math.max(0.2, Math.min(4, s * (e.deltaY > 0 ? 0.9 : 1.1))));
  }

  function onNodeMouseDown(e: React.MouseEvent, id: string) {
    e.stopPropagation(); // prevent pan
    nodeDragRef.current = id;
    const pos = clientToNode(e.clientX, e.clientY);
    pinnedRef.current = { id, ...pos };
  }

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
        onMouseDown={onSvgMouseDown}
        onMouseMove={onSvgMouseMove}
        onMouseUp={onSvgMouseUp}
        onMouseLeave={onSvgMouseUp}
        style={{ cursor: nodeDragRef.current ? "grabbing" : panDragRef.current ? "grabbing" : "grab" }}
      >
        <g transform={`translate(${pan.x + CX * (1 - scale)},${pan.y + CY * (1 - scale)}) scale(${scale})`}>
          {edges.map((e, i) => {
            const ap = posMap.get(e.from);
            const bp = posMap.get(e.to);
            if (!ap || !bp) return null;
            const isConnected = hover && (e.from === hover || e.to === hover);
            const dimmed = hoveredSet && !isConnected;
            return (
              <line
                key={`e${i}`}
                className={`nk-graph-edge nk-graph-edge--${e.kind}`}
                x1={ap.x} y1={ap.y} x2={bp.x} y2={bp.y}
                style={{
                  opacity: dimmed ? 0.05 : undefined,
                  stroke: isConnected ? YELLOW : undefined,
                  strokeWidth: isConnected ? 1 : undefined,
                  transition: "stroke 0.25s, opacity 0.25s",
                }}
              />
            );
          })}

          {nodes.map((n) => {
            const pos = posMap.get(n.id);
            if (!pos) return null;
            const r = nodeRadius(n);
            const isHovered = hover === n.id;
            const isNeighbor = hoveredSet ? hoveredSet.has(n.id) : false;
            const dimmed = hoveredSet && !isNeighbor;
            const label = labelFor(n, encryptionRequired);

            return (
              <g
                key={n.id}
                transform={`translate(${pos.x},${pos.y})`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onMouseDown={(e) => onNodeMouseDown(e, n.id)}
                onClick={() => { if (n.kind === "note" && n.refId) setActiveNote(n.refId); }}
                style={{
                  cursor: "grab",
                  opacity: dimmed ? 0.12 : 1,
                  transition: "opacity 0.25s",
                }}
              >
                <circle
                  r={isHovered ? r + 2 : r}
                  style={{ fill: isHovered ? YELLOW : undefined, transition: "fill 0.25s" }}
                  className={[
                    "nk-graph-node",
                    `nk-graph-node--${n.kind}`,
                    n.degree >= 3 ? "hub" : "",
                    n.encrypted && !encryptionRequired ? "encrypted" : "",
                    n.kind === "member" && n.memberKind === "agent" ? "agent" : "",
                  ].filter(Boolean).join(" ")}
                />
                <text
                  className="nk-graph-label"
                  y={r + 14}
                  style={{
                    fontWeight: isHovered ? 700 : isNeighbor ? 500 : 400,
                    fill: isHovered ? YELLOW : undefined,
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
          Drag node to move · scroll to zoom · drag background to pan
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
  const base = n.kind === "project" ? 5 : n.kind === "member" ? 4 : 4;
  return base + Math.sqrt(Math.max(0, n.degree)) * 1.4;
}

function labelFor(n: GraphNode, encryptionRequired: boolean): string {
  const lock = n.encrypted && !encryptionRequired ? "🔒 " : "";
  const agentTag = n.kind === "member" && n.memberKind === "agent" ? "🤖 " : "";
  const text = n.label.length > 24 ? n.label.slice(0, 23) + "…" : n.label;
  return `${lock}${agentTag}${text}`;
}

// ── Graph build (metadata only, no positions) ──────────────────────────────

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
