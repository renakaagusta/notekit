import { useMemo, useState } from "react";
import { useNotesStore } from "../stores/notesStore";
import { noteTitle } from "../lib/note-display";

const WIDTH = 1000;
const HEIGHT = 600;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;

interface Node {
  id: string;
  title: string;
  x: number;
  y: number;
  degree: number;
}

interface Edge {
  from: string;
  to: string;
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

export function GraphView() {
  const notes = useNotesStore((s) => s.all());
  const setActive = useNotesStore((s) => s.setActive);
  const [hover, setHover] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const byTitle = new Map<string, string>();
    const titles = notes.map((n) => {
      const t = noteTitle(n);
      byTitle.set(t.toLowerCase(), n.id);
      return { id: n.id, title: t };
    });

    const edgeList: Edge[] = [];
    const degree = new Map<string, number>();
    for (const n of notes) {
      const matches = n.body.matchAll(WIKILINK_RE);
      for (const m of matches) {
        const target = m[1]?.trim().toLowerCase();
        if (!target) continue;
        const toId = byTitle.get(target);
        if (toId && toId !== n.id) {
          edgeList.push({ from: n.id, to: toId });
          degree.set(n.id, (degree.get(n.id) ?? 0) + 1);
          degree.set(toId, (degree.get(toId) ?? 0) + 1);
        }
      }
    }

    const count = titles.length;
    const radius = Math.min(WIDTH, HEIGHT) / 2 - 80;
    const nodeList: Node[] = titles.map((t, i) => {
      const angle = count === 0 ? 0 : (i / count) * Math.PI * 2 - Math.PI / 2;
      return {
        id: t.id,
        title: t.title,
        x: CENTER_X + Math.cos(angle) * radius,
        y: CENTER_Y + Math.sin(angle) * radius,
        degree: degree.get(t.id) ?? 0,
      };
    });

    return { nodes: nodeList, edges: edgeList };
  }, [notes]);

  if (nodes.length === 0) {
    return (
      <div className="nk-empty nk-empty--center">
        <p>No notes to graph yet.</p>
        <p className="nk-empty-hint">
          Create notes and link them with{" "}
          <code style={{ fontFamily: "var(--mono-font)" }}>[[wikilinks]]</code>.
        </p>
      </div>
    );
  }

  const nodeIndex = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="nk-graph">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        {edges.map((e, i) => {
          const a = nodeIndex.get(e.from);
          const b = nodeIndex.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              className="nk-graph-edge"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        })}
        {nodes.map((n) => {
          const r = 8 + Math.min(n.degree * 2, 14);
          const isHover = hover === n.id;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x}, ${n.y})`}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setActive(n.id)}
              style={{ cursor: "pointer" }}
            >
              <circle
                className={
                  "nk-graph-node" + (n.degree >= 2 ? " hub" : "")
                }
                r={r}
              />
              <text
                className="nk-graph-label"
                y={r + 14}
                style={{ fontWeight: isHover ? 600 : 400 }}
              >
                {n.title.length > 24 ? n.title.slice(0, 23) + "…" : n.title}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="nk-graph-legend">
        <div>
          <b>{nodes.length}</b> notes · <b>{edges.length}</b> links
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)" }}>
          Click a node to open · larger = more links
        </div>
      </div>
    </div>
  );
}
