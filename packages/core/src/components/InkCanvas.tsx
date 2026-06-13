import { useEffect, useRef, useCallback } from "react";
import type { InkDocument, InkStroke, InkPoint, InkTool } from "../types/ink";

/**
 * Pen/stylus ink capture + render surface (#30).
 *
 * Input via the Pointer Events API so one component covers Apple Pencil
 * (iPad WebView), Android stylus, desktop pen/Wacom, and mouse/touch
 * fallback. Pressure drives stroke width; `getCoalescedEvents()` recovers
 * the high-frequency samples Pencil emits between frames; touch pointers
 * are ignored while a pen is active (palm rejection); live drawing is
 * batched to `requestAnimationFrame`.
 *
 * NOTE: pointer fidelity (pressure curve, palm rejection, Pencil
 * coalescing) needs on-device verification — it can't be exercised
 * headless. Logic and lifecycle are unit-reviewable; the feel is not.
 */
export interface InkCanvasProps {
  doc: InkDocument;
  onChange: (doc: InkDocument) => void;
  tool?: InkTool;
  color?: string;
  width?: number;
  /** When true, the surface is transparent (annotation overlay, #32). */
  transparent?: boolean;
}

const TOOL_DEFAULT_WIDTH: Record<InkTool, number> = {
  pen: 2.5,
  highlighter: 14,
  eraser: 18,
};

export function InkCanvas({
  doc,
  onChange,
  tool = "pen",
  color = "#111111",
  width,
  transparent = false,
}: InkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The pointer currently drawing, and the stroke it's building.
  const activePointer = useRef<number | null>(null);
  const current = useRef<InkStroke | null>(null);
  // Latest doc in a ref so pointer handlers don't need to re-bind.
  const docRef = useRef(doc);
  docRef.current = doc;
  const rafPending = useRef(false);

  const strokeWidth = width ?? TOOL_DEFAULT_WIDTH[tool];

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of docRef.current.strokes) drawStroke(ctx, stroke);
    if (current.current) drawStroke(ctx, current.current);
  }, []);

  // Keep the backing store sized to the document, accounting for DPR.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = doc.width * dpr;
    canvas.height = doc.height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }, [doc.width, doc.height, redraw]);

  // Redraw when committed strokes change (e.g. external load / undo).
  useEffect(() => {
    redraw();
  }, [doc.strokes, redraw]);

  const pointFromEvent = useCallback(
    (e: PointerEvent): InkPoint => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const scaleX = docRef.current.width / rect.width;
      const scaleY = docRef.current.height / rect.height;
      const tilt = Math.min(
        1,
        Math.hypot(e.tiltX, e.tiltY) / 90 || 0,
      );
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        p: e.pressure > 0 ? e.pressure : 0.5,
        ...(tilt ? { tilt } : {}),
      };
    },
    [],
  );

  const scheduleRedraw = useCallback(() => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      redraw();
    });
  }, [redraw]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // Palm rejection: once a pen is drawing, ignore touch.
      if (activePointer.current !== null) return;
      if (e.pointerType === "touch" && hasPenCapability()) return;
      activePointer.current = e.pointerId;
      canvasRef.current?.setPointerCapture(e.pointerId);
      current.current = {
        tool,
        color,
        width: strokeWidth,
        points: [pointFromEvent(e.nativeEvent)],
      };
      scheduleRedraw();
    },
    [tool, color, strokeWidth, pointFromEvent, scheduleRedraw],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerId !== activePointer.current || !current.current) return;
      // Recover sub-frame samples for smooth Pencil strokes.
      const coalesced =
        typeof e.nativeEvent.getCoalescedEvents === "function"
          ? e.nativeEvent.getCoalescedEvents()
          : [e.nativeEvent];
      for (const ce of coalesced.length ? coalesced : [e.nativeEvent]) {
        current.current.points.push(pointFromEvent(ce));
      }
      scheduleRedraw();
    },
    [pointFromEvent, scheduleRedraw],
  );

  const finishStroke = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerId !== activePointer.current) return;
      const stroke = current.current;
      current.current = null;
      activePointer.current = null;
      if (!stroke || stroke.points.length === 0) return;
      onChange({
        ...docRef.current,
        strokes: [...docRef.current.strokes, stroke],
      });
    },
    [onChange],
  );

  return (
    <canvas
      ref={canvasRef}
      className={`nk-ink-canvas${transparent ? " nk-ink-canvas--overlay" : ""}`}
      style={
        transparent
          ? { touchAction: "none" }
          : { width: doc.width, height: doc.height, touchAction: "none" }
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    />
  );
}

/** Heuristic: does this device report a fine pointer (pen/mouse)? */
function hasPenCapability(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(any-pointer: fine)").matches
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: InkStroke) {
  const { points } = stroke;
  if (points.length === 0) return;

  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1;
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : 1;
  }
  ctx.strokeStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Variable width: draw segment-by-segment so pressure modulates the line.
  if (points.length === 1) {
    const p = points[0]!;
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (stroke.width * (p.p ?? 0.5)) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const pressure = ((a.p ?? 0.5) + (b.p ?? 0.5)) / 2;
      ctx.lineWidth = stroke.width * (0.4 + 0.6 * pressure);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
