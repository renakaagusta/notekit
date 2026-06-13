/**
 * Vector ink format for pen/stylus drawings and annotations (#29/#31).
 *
 * Strokes are stored as points (with pressure/tilt) rather than a
 * flattened bitmap: small, diffable, scalable, re-editable, and fully
 * E2EE since it's our own data (unlike remote image/pdf URLs). A drawing
 * is persisted as a note with `format: "ink"` whose body is the JSON of
 * an {@link InkDocument}.
 */

export type InkTool = "pen" | "highlighter" | "eraser";

export interface InkPoint {
  x: number;
  y: number;
  /** Pointer pressure 0–1 (Pointer Events `pressure`); default 0.5. */
  p?: number;
  /** Tilt magnitude 0–1, derived from tiltX/tiltY; optional. */
  tilt?: number;
}

export interface InkStroke {
  points: InkPoint[];
  tool: InkTool;
  /** CSS color. */
  color: string;
  /** Base stroke width in px (pressure modulates around this). */
  width: number;
}

export interface InkDocument {
  v: 1;
  /** Canvas dimensions the strokes were captured at, for scaling. */
  width: number;
  height: number;
  strokes: InkStroke[];
}

export function emptyInkDocument(width = 1000, height = 1400): InkDocument {
  return { v: 1, width, height, strokes: [] };
}
