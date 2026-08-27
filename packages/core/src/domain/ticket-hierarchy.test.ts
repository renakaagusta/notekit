import { describe, expect, it } from "vitest";
import type { Ticket } from "./entities/ticket";
import {
  canReparent,
  childProgress,
  childrenOf,
  descendantIds,
  topLevelTickets,
} from "./ticket-hierarchy";

function ticket(id: string, parentId?: string, status: Ticket["status"] = "todo"): Ticket {
  return {
    id,
    ...(parentId ? { parentId } : {}),
    path: `tickets/${id}.md.age`,
    title: id,
    body: "",
    status,
    priority: "medium",
    assignee: null,
    labels: [],
    linkedNotes: [],
    createdAt: "t",
    updatedAt: "t",
    dueDate: null,
    createdBy: null,
  };
}

// root ─┬─ a ─── a1
//       └─ b
const tree = [
  ticket("root"),
  ticket("a", "root"),
  ticket("a1", "a", "done"),
  ticket("b", "root"),
  ticket("solo"),
];

describe("childrenOf / topLevelTickets", () => {
  it("returns only direct children", () => {
    expect(childrenOf("root", tree).map((t) => t.id)).toEqual(["a", "b"]);
    expect(childrenOf("a", tree).map((t) => t.id)).toEqual(["a1"]);
    expect(childrenOf("a1", tree)).toEqual([]);
  });

  it("lists tickets with no parent as top level", () => {
    expect(topLevelTickets(tree).map((t) => t.id)).toEqual(["root", "solo"]);
  });
});

describe("descendantIds", () => {
  it("walks the whole subtree, excluding the root", () => {
    expect(descendantIds("root", tree)).toEqual(new Set(["a", "a1", "b"]));
    expect(descendantIds("a", tree)).toEqual(new Set(["a1"]));
    expect(descendantIds("solo", tree)).toEqual(new Set());
  });

  it("does not loop forever on a pre-existing cycle", () => {
    const cyclic = [ticket("x", "y"), ticket("y", "x")];
    expect(descendantIds("x", cyclic)).toEqual(new Set(["x", "y"]));
  });
});

describe("canReparent", () => {
  it("rejects self-parenting", () => {
    expect(canReparent("a", "a", tree)).toBe(false);
  });

  it("rejects moving a ticket under its own descendant", () => {
    expect(canReparent("root", "a1", tree)).toBe(false);
    expect(canReparent("a", "a1", tree)).toBe(false);
  });

  it("allows a valid reparent", () => {
    expect(canReparent("solo", "a", tree)).toBe(true);
    expect(canReparent("b", "a", tree)).toBe(true);
  });
});

describe("childProgress", () => {
  it("counts done/archived direct children over the total", () => {
    expect(childProgress("a", tree)).toEqual({ done: 1, total: 1 });
    expect(childProgress("root", tree)).toEqual({ done: 0, total: 2 });
    expect(childProgress("solo", tree)).toEqual({ done: 0, total: 0 });
  });
});
