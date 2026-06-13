import { describe, it, expect } from "vitest";
import { serializeInk, parseInk, simplifyStroke, simplifyInk } from "./ink";
import { emptyInkDocument, type InkDocument } from "../types/ink";

const doc: InkDocument = {
  v: 1,
  width: 800,
  height: 600,
  strokes: [
    {
      tool: "pen",
      color: "#111111",
      width: 2,
      points: [
        { x: 0, y: 0, p: 0.5 },
        { x: 10, y: 10, p: 0.7 },
      ],
    },
  ],
};

describe("ink serialize/parse", () => {
  it("round-trips a document", () => {
    expect(parseInk(serializeInk(doc))).toEqual(doc);
  });

  it("returns an empty document for junk", () => {
    expect(parseInk("not json")).toEqual(emptyInkDocument());
    expect(parseInk("42").strokes).toEqual([]);
  });

  it("drops malformed strokes and points but keeps valid ones", () => {
    const messy = JSON.stringify({
      width: 800,
      height: 600,
      strokes: [
        { points: [] }, // empty → dropped
        { points: [{ x: 1, y: 2 }, { x: "bad", y: 3 }], tool: "ghost" },
        "nope",
      ],
    });
    const parsed = parseInk(messy);
    expect(parsed.strokes).toHaveLength(1);
    expect(parsed.strokes[0]!.tool).toBe("pen"); // unknown tool → pen
    expect(parsed.strokes[0]!.points).toHaveLength(1); // bad point dropped
    expect(parsed.strokes[0]!.color).toBe("#111111"); // default
  });

  it("clamps pressure into 0..1", () => {
    const parsed = parseInk(
      JSON.stringify({
        strokes: [{ points: [{ x: 0, y: 0, p: 5 }, { x: 1, y: 1, p: -3 }] }],
      }),
    );
    expect(parsed.strokes[0]!.points[0]!.p).toBe(1);
    expect(parsed.strokes[0]!.points[1]!.p).toBe(0);
  });
});

describe("simplifyStroke (RDP)", () => {
  it("keeps endpoints and drops near-collinear midpoints", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 0.01 },
      { x: 2, y: 0 },
      { x: 3, y: 0.01 },
      { x: 4, y: 0 },
    ];
    const out = simplifyStroke(line, 0.5);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 4, y: 0 });
    expect(out.length).toBeLessThan(line.length);
  });

  it("preserves a sharp corner", () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ];
    expect(simplifyStroke(corner, 0.5)).toHaveLength(3);
  });

  it("leaves 2-point strokes untouched", () => {
    const two = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(simplifyStroke(two)).toEqual(two);
  });

  it("simplifyInk maps over all strokes", () => {
    const dense: InkDocument = {
      v: 1,
      width: 10,
      height: 10,
      strokes: [
        {
          tool: "pen",
          color: "#000",
          width: 1,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 3, y: 0 },
          ],
        },
      ],
    };
    expect(simplifyInk(dense).strokes[0]!.points).toHaveLength(2);
  });
});
