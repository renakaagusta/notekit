import { useEffect, useMemo, useRef, useState } from "react";
import { Application, Container, Graphics, Text, type FederatedPointerEvent } from "pixi.js";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
} from "d3-force";
import { useNotesStore } from "../stores/notesStore";
import { useTicketsStore } from "../stores/ticketsStore";
import { useMembersStore } from "../stores/membersStore";
import { useCryptoStore } from "../stores/cryptoStore";
import {
  buildGraph,
  DEFAULT_FILTER,
  labelFor,
  nodeRadius,
  type FilterState,
  type GraphEdge,
  type GraphNode,
  type NodeKind,
} from "../lib/graph-data";

// Obsidian-style knowledge graph: d3-force for the layout, PixiJS (WebGL) for
// rendering. This replaces the earlier hand-rolled SVG simulation — WebGL keeps
// it smooth as the vault grows, the way Obsidian's does. Physics runs on the
// main thread for now (fine into the low thousands of nodes); moving d3-force
// into a Web Worker — Obsidian's final trick — is the next step if scale demands.

const KIND_COLOR: Record<NodeKind, number> = {
  note: 0xf5c542,
  ticket: 0x6ea8fe,
  project: 0xc98bff,
  member: 0x4ade80,
};

// Fixed gold for hover highlight (hovered node + its links), matching the old
// graph. Deliberately NOT the theme --accent: a user can set accent to white,
// which would make the highlight vanish against the dark canvas.
const HOVER_COLOR = 0xf5c542;

// Per-frame easing factor for hover transitions — how far current animates
// toward target each frame (~0.25 ≈ a soft 150ms settle at 60fps).
const EASE = 0.25;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function unpack(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
function pack(r: number, g: number, b: number): number {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}
function lerpColor(a: number, b: number, t: number): number {
  const [ar, ag, ab] = unpack(a);
  const [br, bg, bb] = unpack(b);
  return pack(lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t));
}

// Animated display state per node — current values chase the targets each
// frame so hover in/out eases instead of snapping.
interface NodeAnim {
  a: number;
  ta: number; // circle alpha
  col: [number, number, number];
  tcol: [number, number, number]; // circle tint (rgb)
  la: number;
  tla: number; // label alpha
}

// d3-force mutates these with x/y/vx/vy/fx/fy as it runs.
interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
}
interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  kind: string;
}

// Resolve a CSS colour (hex / rgb / color-mix) to a 0xRRGGBB int for Pixi by
// letting the browser compute it via a throwaway element.
function resolveColor(raw: string, fallback: number): number {
  const v = raw.trim();
  if (!v) return fallback;
  const probe = document.createElement("span");
  probe.style.color = v;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return fallback;
  const r = Number(m[0]);
  const g = Number(m[1]);
  const b = Number(m[2]);
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

interface Theme {
  link: number;
  text: number;
}

// ── PixiJS + d3-force controller ────────────────────────────────────────────
// Kept outside React: owns the WebGL app, the simulation, and all pointer
// interaction (pan / zoom / node drag). React just feeds it data via setData().
class GraphCanvas {
  private app: Application | null = null;
  private readonly world = new Container();
  private readonly linkLayer = new Graphics();
  private readonly nodeLayer = new Container();
  private readonly labelLayer = new Container();
  private sim: Simulation<SimNode, SimLink> | null = null;
  private nodes: SimNode[] = [];
  private links: SimLink[] = [];
  private readonly nodeGfx = new Map<string, Graphics>();
  private readonly labels = new Map<string, Text>();
  private scale = 1;
  private theme: Theme = { link: 0x8a8f98, text: 0x333333 };
  // eslint-disable-next-line @typescript-eslint/no-empty-function -- default no-op; overwritten in setData()
  private onNodeClick: (n: SimNode) => void = () => {};
  private destroyed = false;
  private dragging: SimNode | null = null;
  private dragMoved = false;
  private panning = false;
  private lastPointer = { x: 0, y: 0 };
  // Hover highlight: neighbours[id] = the node's own id plus every node one hop
  // away. Used to dim everything else and light up incident links, Obsidian-style.
  private readonly neighbors = new Map<string, Set<string>>();
  private hoveredId: string | null = null;
  // Eased hover animation. `anim` holds each node's current/target colour+alpha;
  // hoverAmt (0→1) fades the link highlight; highlightId is retained through the
  // fade-out so incident links ease back rather than snap. simActive keeps the
  // frame loop alive while d3 is still moving nodes.
  private readonly anim = new Map<string, NodeAnim>();
  private hoverAmt = 0;
  private hoverTarget = 0;
  private highlightId: string | null = null;
  private animating = false;
  private simActive = false;

  async init(container: HTMLElement): Promise<void> {
    const app = new Application();
    // resolution + autoDensity render at the device's physical pixel density,
    // so circles/text stay crisp instead of looking "pecah" (pixelated) when
    // zoomed in on a HiDPI/retina display.
    await app.init({
      resizeTo: container,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    if (this.destroyed) {
      app.destroy(true, { children: true });
      return;
    }
    this.app = app;
    container.appendChild(app.canvas);

    this.world.addChild(this.linkLayer);
    this.world.addChild(this.nodeLayer);
    this.world.addChild(this.labelLayer);
    app.stage.addChild(this.world);

    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointerdown", this.onBackgroundDown);
    app.stage.on("pointermove", this.onPointerMove);
    app.stage.on("pointerup", this.onPointerUp);
    app.stage.on("pointerupoutside", this.onPointerUp);
    app.canvas.addEventListener("wheel", this.onWheel, { passive: false });

    // Permanent render loop for eased hover/link animation. Cheap: it early-
    // returns whenever nothing is animating and the sim is at rest.
    app.ticker.add(this.onFrame);
  }

  setData(nodes: GraphNode[], edges: GraphEdge[], encReq: boolean, theme: Theme, onNodeClick: (n: SimNode) => void): void {
    if (!this.app || this.destroyed) return;
    this.theme = theme;
    this.onNodeClick = onNodeClick;

    // Preserve positions across rebuilds (e.g. toggling a filter) so the graph
    // doesn't jump. New nodes seed near the centre.
    const prev = new Map(this.nodes.map((n) => [n.id, n]));
    const { width, height } = this.app.screen;
    const cx = width / 2;
    const cy = height / 2;
    this.nodes = nodes.map((n) => {
      const old = prev.get(n.id);
      return {
        ...n,
        x: old?.x ?? cx + (Math.cos(n.id.length) * 40 + (n.degree % 7) * 12),
        y: old?.y ?? cy + (Math.sin(n.id.length) * 40 + (n.id.length % 7) * 12),
      };
    });
    this.links = edges.map((e) => ({ source: e.from, target: e.to, kind: e.kind }));

    // Adjacency for hover highlighting: each node maps to itself + direct peers.
    this.neighbors.clear();
    for (const n of this.nodes) this.neighbors.set(n.id, new Set([n.id]));
    for (const e of edges) {
      this.neighbors.get(e.from)?.add(e.to);
      this.neighbors.get(e.to)?.add(e.from);
    }
    this.hoveredId = null;

    this.rebuildDisplay(encReq);
    this.startSim(cx, cy);
  }

  private rebuildDisplay(encReq: boolean): void {
    this.nodeLayer.removeChildren().forEach((c) => c.destroy());
    this.labelLayer.removeChildren().forEach((c) => c.destroy());
    this.nodeGfx.clear();
    this.labels.clear();
    this.anim.clear();
    this.hoverAmt = 0;
    this.hoverTarget = 0;
    this.highlightId = null;

    for (const n of this.nodes) {
      const r = nodeRadius(n);
      const baseCol = KIND_COLOR[n.kind] ?? 0x888888;
      this.anim.set(n.id, {
        a: 1, ta: 1,
        col: unpack(baseCol), tcol: unpack(baseCol),
        la: 1, tla: 1,
      });
      const g = new Graphics();
      // Draw white, colour via tint — lets applyHighlight() recolour a node
      // (accent for the hovered one, text colour for its neighbours) without
      // re-drawing geometry.
      g.circle(0, 0, r).fill({ color: 0xffffff, alpha: 0.95 });
      if (n.degree >= 3) g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.25 });
      g.tint = KIND_COLOR[n.kind] ?? 0x888888;
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointerdown", (e: FederatedPointerEvent) => {
        e.stopPropagation();
        this.dragging = n;
        this.dragMoved = false;
        this.sim?.alphaTarget(0.3).restart();
        const p = this.world.toLocal(e.global);
        n.fx = p.x;
        n.fy = p.y;
      });
      g.on("pointertap", () => {
        if (!this.dragMoved) this.onNodeClick(n);
      });
      g.on("pointerover", () => {
        this.hoveredId = n.id;
        this.applyHighlight();
      });
      g.on("pointerout", () => {
        if (this.hoveredId === n.id) {
          this.hoveredId = null;
          this.applyHighlight();
        }
      });
      this.nodeLayer.addChild(g);
      this.nodeGfx.set(n.id, g);

      const label = new Text({
        text: labelFor(n, encReq),
        style: { fontFamily: "sans-serif", fontSize: 11, fill: this.theme.text },
      });
      label.anchor.set(0.5, 0);
      label.resolution = 2;
      this.labelLayer.addChild(label);
      this.labels.set(n.id, label);
    }
  }

  private startSim(cx: number, cy: number): void {
    this.sim?.stop();
    this.sim = forceSimulation<SimNode, SimLink>(this.nodes)
      .force("charge", forceManyBody<SimNode>().strength(-140))
      .force(
        "link",
        forceLink<SimNode, SimLink>(this.links)
          .id((d) => d.id)
          .distance(62)
          .strength(0.5),
      )
      .force("center", forceCenter(cx, cy))
      .force("collide", forceCollide<SimNode>().radius((d) => nodeRadius(d) + 4))
      .on("tick", this.onTick)
      .on("end", () => { this.simActive = false; });
    this.simActive = true;
    this.sim.alpha(0.9).restart();
  }

  private readonly onTick = (): void => {
    this.simActive = true;
    for (const n of this.nodes) {
      const g = this.nodeGfx.get(n.id);
      if (g) g.position.set(n.x, n.y);
      const t = this.labels.get(n.id);
      if (t) t.position.set(n.x, n.y + nodeRadius(n) + 2);
    }
  };

  // Per-frame animation: ease each node's colour/alpha toward its target and
  // fade the link highlight, then redraw edges. Idles (early return) once the
  // hover has settled and the sim is at rest, so it costs nothing when static.
  private readonly onFrame = (): void => {
    if (!this.animating && !this.simActive) return;
    let active = false;

    this.hoverAmt += (this.hoverTarget - this.hoverAmt) * EASE;
    if (Math.abs(this.hoverTarget - this.hoverAmt) > 0.005) active = true;
    else this.hoverAmt = this.hoverTarget;
    if (this.hoverTarget === 0 && this.hoverAmt < 0.01) this.highlightId = null;

    for (const n of this.nodes) {
      const s = this.anim.get(n.id);
      if (!s) continue;
      s.a += (s.ta - s.a) * EASE;
      s.la += (s.tla - s.la) * EASE;
      s.col[0] += (s.tcol[0] - s.col[0]) * EASE;
      s.col[1] += (s.tcol[1] - s.col[1]) * EASE;
      s.col[2] += (s.tcol[2] - s.col[2]) * EASE;
      if (
        Math.abs(s.ta - s.a) > 0.004 || Math.abs(s.tla - s.la) > 0.004 ||
        Math.abs(s.tcol[0] - s.col[0]) > 1 || Math.abs(s.tcol[1] - s.col[1]) > 1 ||
        Math.abs(s.tcol[2] - s.col[2]) > 1
      ) active = true;
      const g = this.nodeGfx.get(n.id);
      if (g) { g.alpha = s.a; g.tint = pack(s.col[0], s.col[1], s.col[2]); }
      const t = this.labels.get(n.id);
      if (t) t.alpha = s.la;
    }

    this.drawLinks();
    this.animating = active;
  };

  // Redraw all edges. When a node is highlighted, non-incident edges fade out
  // and incident ones ease toward the gold hover colour — all interpolated by
  // hoverAmt so the transition is smooth in both directions.
  private drawLinks(): void {
    const g = this.linkLayer;
    g.clear();
    const amt = this.hoverAmt;
    const hl = this.highlightId;

    for (const l of this.links) {
      const s = l.source as SimNode;
      const t = l.target as SimNode;
      if (s?.x == null || t?.x == null) continue;
      if (hl != null && (s.id === hl || t.id === hl)) continue; // painted in pass 2
      g.moveTo(s.x, s.y).lineTo(t.x, t.y);
    }
    g.stroke({ width: 1, color: this.theme.link, alpha: lerp(0.45, 0.06, amt) });

    if (hl == null || amt <= 0.01) return;
    for (const l of this.links) {
      const s = l.source as SimNode;
      const t = l.target as SimNode;
      if (s?.x == null || t?.x == null) continue;
      if (s.id !== hl && t.id !== hl) continue;
      g.moveTo(s.x, s.y).lineTo(t.x, t.y);
    }
    g.stroke({
      width: lerp(1, 1.6, amt),
      color: lerpColor(this.theme.link, HOVER_COLOR, amt),
      alpha: lerp(0.45, 0.95, amt),
    });
  }

  // Set animation targets from the current hover. The frame loop eases toward
  // them. Hovered node → gold, neighbours → theme text colour, rest → dimmed.
  private applyHighlight(): void {
    const hov = this.hoveredId;
    const near = hov != null ? this.neighbors.get(hov) : null;
    for (const n of this.nodes) {
      const s = this.anim.get(n.id);
      if (!s) continue;
      const base = KIND_COLOR[n.kind] ?? 0x888888;
      if (hov == null) {
        s.ta = 1; s.tcol = unpack(base); s.tla = 1;
      } else if (n.id === hov) {
        s.ta = 1; s.tcol = unpack(HOVER_COLOR); s.tla = 1;
      } else if (near?.has(n.id)) {
        s.ta = 1; s.tcol = unpack(this.theme.text); s.tla = 0.95;
      } else {
        s.ta = 0.12; s.tcol = unpack(base); s.tla = 0.08;
      }
    }
    if (hov != null) { this.highlightId = hov; this.hoverTarget = 1; }
    else this.hoverTarget = 0;
    this.animating = true;
  }

  private readonly onBackgroundDown = (e: FederatedPointerEvent): void => {
    if (e.target !== this.app?.stage) return; // a node started a drag
    this.panning = true;
    this.lastPointer = { x: e.global.x, y: e.global.y };
  };

  private readonly onPointerMove = (e: FederatedPointerEvent): void => {
    if (this.dragging) {
      this.dragMoved = true;
      const p = this.world.toLocal(e.global);
      this.dragging.fx = p.x;
      this.dragging.fy = p.y;
      return;
    }
    if (this.panning) {
      this.world.position.x += e.global.x - this.lastPointer.x;
      this.world.position.y += e.global.y - this.lastPointer.y;
      this.lastPointer = { x: e.global.x, y: e.global.y };
    }
  };

  private readonly onPointerUp = (): void => {
    if (this.dragging) {
      this.dragging.fx = null;
      this.dragging.fy = null;
      this.sim?.alphaTarget(0);
      this.dragging = null;
    }
    this.panning = false;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.app) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newScale = Math.max(0.15, Math.min(4, this.scale * factor));
    const rect = this.app.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = this.world.toLocal({ x: mx, y: my });
    this.world.scale.set(newScale);
    this.world.position.set(mx - before.x * newScale, my - before.y * newScale);
    this.scale = newScale;
  };

  destroy(): void {
    this.destroyed = true;
    this.sim?.stop();
    if (this.app) {
      this.app.canvas.removeEventListener("wheel", this.onWheel);
      this.app.destroy(true, { children: true });
      this.app = null;
    }
  }
}

// ── React component ─────────────────────────────────────────────────────────

// eslint-disable-next-line max-lines-per-function -- three useEffect hooks (init, data feed, members load) + filter controls; no meaningful split
export function GraphView() {
  const notes = useNotesStore((s) => s.all());
  const tickets = useTicketsStore((s) => s.all());
  const encryptionRequired = useCryptoStore((s) => s.encryptionRequired);
  const setActiveNote = useNotesStore((s) => s.setActive);
  const membersStatus = useMembersStore((s) => s.status);
  const memberList = useMembersStore((s) => s.members);
  const loadMembers = useMembersStore((s) => s.load);

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<GraphCanvas | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (membersStatus === "idle") void loadMembers();
  }, [membersStatus, loadMembers]);

  const { nodes, edges, stats } = useMemo(
    () => buildGraph({ notes, tickets, members: memberList, filters }),
    [notes, tickets, memberList, filters],
  );

  // Spin up the WebGL app once; tear it down on unmount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const gc = new GraphCanvas();
    canvasRef.current = gc;
    void gc.init(el).then(() => {
      if (canvasRef.current === gc) setReady(true);
    });
    return () => {
      canvasRef.current = null;
      gc.destroy();
    };
  }, []);

  // Feed data whenever the graph or theme changes.
  useEffect(() => {
    const gc = canvasRef.current;
    const el = containerRef.current;
    if (!gc || !ready || !el) return;
    const cs = getComputedStyle(el);
    const theme = {
      link: resolveColor(cs.getPropertyValue("--muted"), 0x8a8f98),
      text: resolveColor(cs.getPropertyValue("--text"), 0x333333),
    };
    gc.setData(nodes, edges, encryptionRequired, theme, (n) => {
      if (n.kind === "note" && n.refId) setActiveNote(n.refId);
    });
  }, [nodes, edges, encryptionRequired, ready, setActiveNote]);

  const empty = notes.length === 0 && tickets.length === 0;

  return (
    <div className="nk-graph">
      {!empty && (
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
      )}

      <div className="nk-graph-canvas" ref={containerRef} />

      {empty ? (
        <div className="nk-empty nk-empty--center nk-graph-empty">
          <p>No notes or tickets to graph yet.</p>
          <p className="nk-empty-hint">
            Add a few items and connect them with{" "}
            <code style={{ fontFamily: "var(--mono-font)" }}>[[wikilinks]]</code>.
          </p>
        </div>
      ) : (
        <div className="nk-graph-legend">
          <div>
            <b>{stats.notes}</b> notes · <b>{stats.tickets}</b> tickets ·{" "}
            <b>{stats.projects}</b> projects · <b>{stats.members}</b> members
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
            Drag node to move · scroll to zoom · drag background to pan · click note to open
          </div>
        </div>
      )}
    </div>
  );
}

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
