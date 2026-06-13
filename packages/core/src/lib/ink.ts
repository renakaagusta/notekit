import type {
  InkDocument,
  InkStroke,
  InkPoint,
  InkTool,
} from "../types/ink";
import { emptyInkDocument } from "../types/ink";

/**
 * Serialize / parse the {@link InkDocument} stored in an `ink`-format
 * note body, plus a stroke simplifier to cap file size on dense input.
 * Pure and runtime-agnostic so it's unit-tested in node.
 */

export function serializeInk(doc: InkDocument): string {
  return JSON.stringify(doc);
}

/** Parse an ink note body. Returns an empty document on anything invalid. */
export function parseInk(body: string): InkDocument {
  try {
    const raw = JSON.parse(body) as unknown;
    return normalizeInk(raw);
  } catch {
    return emptyInkDocument();
  }
}

const TOOLS: InkTool[] = ["pen", "highlighter", "eraser"];

function normalizeInk(raw: unknown): InkDocument {
  if (!raw || typeof raw !== "object") return emptyInkDocument();
  const o = raw as Record<string, unknown>;
  const width = num(o.width, 1000);
  const height = num(o.height, 1400);
  const strokes = Array.isArray(o.strokes)
    ? o.strokes.map(normalizeStroke).filter((s): s is InkStroke => s !== null)
    : [];
  return { v: 1, width, height, strokes };
}

function normalizeStroke(raw: unknown): InkStroke | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.points)) return null;
  const points = o.points
    .map(normalizePoint)
    .filter((p): p is InkPoint => p !== null);
  if (points.length === 0) return null;
  const tool = TOOLS.includes(o.tool as InkTool) ? (o.tool as InkTool) : "pen";
  return {
    points,
    tool,
    color: typeof o.color === "string" ? o.color : "#111111",
    width: num(o.width, 2),
  };
}

function normalizePoint(raw: unknown): InkPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.x !== "number" || typeof o.y !== "number") return null;
  const point: InkPoint = { x: o.x, y: o.y };
  if (typeof o.p === "number") point.p = clamp01(o.p);
  if (typeof o.tilt === "number") point.tilt = clamp01(o.tilt);
  return point;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Ramer–Douglas–Peucker stroke simplification. Drops points that lie
 * within `epsilon` px of the line between their neighbours — caps file
 * size on dense pen sampling while preserving stroke shape. Pressure is
 * carried from the surviving points.
 */
export function simplifyStroke(points: InkPoint[], epsilon = 0.75): InkPoint[] {
  if (points.length <= 2) return points;
  return rdp(points, 0, points.length - 1, epsilon);
}

function rdp(
  pts: InkPoint[],
  first: number,
  last: number,
  eps: number,
): InkPoint[] {
  let maxDist = 0;
  let index = -1;
  for (let i = first + 1; i < last; i++) {
    const d = perpDistance(pts[i]!, pts[first]!, pts[last]!);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > eps && index !== -1) {
    const left = rdp(pts, first, index, eps);
    const right = rdp(pts, index, last, eps);
    return [...left.slice(0, -1), ...right];
  }
  return [pts[first]!, pts[last]!];
}

function perpDistance(p: InkPoint, a: InkPoint, b: InkPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const area = Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy);
  return area / len;
}

export function simplifyInk(doc: InkDocument, epsilon = 0.75): InkDocument {
  return {
    ...doc,
    strokes: doc.strokes.map((s) => ({
      ...s,
      points: simplifyStroke(s.points, epsilon),
    })),
  };
}
