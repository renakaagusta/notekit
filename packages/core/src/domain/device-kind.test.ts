import { describe, expect, it } from "vitest";
import { deviceKindFrom, deviceKindLabel, inferDeviceKind } from "./device-kind";

describe("deviceKindFrom", () => {
  it("maps native mobile platforms", () => {
    expect(deviceKindFrom({ native: "ios", electron: false })).toBe("ios");
    expect(deviceKindFrom({ native: "android", electron: false })).toBe("android");
  });

  it("is desktop under an Electron wrapper, web otherwise", () => {
    expect(deviceKindFrom({ native: "web", electron: true })).toBe("desktop");
    expect(deviceKindFrom({ native: "web", electron: false })).toBe("web");
    expect(deviceKindFrom({ native: null, electron: false })).toBe("web");
  });
});

describe("inferDeviceKind", () => {
  it("reads the agent runtime off the deviceId prefix", () => {
    expect(inferDeviceKind("cli-abc123")).toBe("cli");
    expect(inferDeviceKind("mcp-xyz789")).toBe("mcp");
  });

  it("can't infer a browser device (bare nanoid)", () => {
    expect(inferDeviceKind("V1StGXR8Z5")).toBeUndefined();
  });
});

describe("deviceKindLabel", () => {
  it("labels every kind", () => {
    expect(deviceKindLabel("web")).toBe("Web");
    expect(deviceKindLabel("desktop")).toBe("Desktop app");
    expect(deviceKindLabel("cli")).toBe("CLI");
    expect(deviceKindLabel("mcp")).toBe("MCP agent");
  });
});
