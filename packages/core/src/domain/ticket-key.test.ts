import { describe, expect, it } from "vitest";
import { deriveTicketKey } from "./ticket-key";

describe("deriveTicketKey", () => {
  it("slugs the title when the key is free", () => {
    expect(deriveTicketKey("Besok: eksplor & apply platform AI", [])).toBe(
      "besok-eksplor-apply-platform-ai",
    );
  });

  it("appends a counter on collision, incrementing past every taken suffix", () => {
    expect(deriveTicketKey("Deploy", ["deploy"])).toBe("deploy-2");
    expect(deriveTicketKey("Deploy", ["deploy", "deploy-2"])).toBe("deploy-3");
  });

  it("collides case-insensitively", () => {
    expect(deriveTicketKey("Deploy", ["DEPLOY"])).toBe("deploy-2");
  });

  it("prefers a user-supplied slug over the title", () => {
    expect(deriveTicketKey("Some long title", [], "buzz-deploy")).toBe("buzz-deploy");
    expect(deriveTicketKey("Some long title", ["buzz-deploy"], "buzz-deploy")).toBe(
      "buzz-deploy-2",
    );
  });

  it("falls back to 'task' when the title slugs to nothing", () => {
    expect(deriveTicketKey("!!! ???", [])).toBe("task");
    expect(deriveTicketKey("", ["task"])).toBe("task-2");
  });
});
