/**
 * Coarse category of a device paired to a vault, used to show a distinct icon +
 * label per runtime (a browser tab vs the desktop app vs a CLI/MCP agent). It is
 * cosmetic metadata — trust is roster membership, never this field — so it stays
 * OUT of the roster signature, exactly like `name`.
 */
export type DeviceKind = "web" | "desktop" | "ios" | "android" | "cli" | "mcp";

/**
 * Derive the kind for a browser-hosted device from the platform detectors that
 * already name it (see `deviceLabel`): native mobile → ios/android, an Electron
 * wrapper → desktop, else a plain web tab.
 */
export function deviceKindFrom(env: {
  native: "ios" | "android" | "web" | null | undefined;
  electron: boolean;
}): DeviceKind {
  if (env.native === "ios") return "ios";
  if (env.native === "android") return "android";
  return env.electron ? "desktop" : "web";
}

/**
 * Best-effort kind for a record written before this field existed. The agent
 * surfaces stamp their runtime into the deviceId (`cli-…` / `mcp-…`); browser
 * devices use a bare nanoid, so they can't be inferred and return undefined.
 */
export function inferDeviceKind(deviceId: string): DeviceKind | undefined {
  if (deviceId.startsWith("cli-")) return "cli";
  if (deviceId.startsWith("mcp-")) return "mcp";
  return undefined;
}

/** Human label for a kind, for the devices list. */
export function deviceKindLabel(kind: DeviceKind): string {
  switch (kind) {
    case "web": return "Web";
    case "desktop": return "Desktop app";
    case "ios": return "iOS app";
    case "android": return "Android app";
    case "cli": return "CLI";
    case "mcp": return "MCP agent";
  }
}
