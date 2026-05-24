// Shared NoteKit API client + small helpers used by every tool/resource.
// We build the client once at startup so each tool call reuses connection
// pooling and the same bearer token resolver.

import { createNoteKitClient, type NoteKitApi } from "@notekit/api-client";

export interface NoteKitMcpConfig {
  baseUrl: string;
  token: string;
}

export function makeClient(config: NoteKitMcpConfig): NoteKitApi {
  return createNoteKitClient({
    baseUrl: config.baseUrl,
    auth: {
      mode: "bearer",
      getToken: () => config.token,
    },
  });
}

/**
 * Convenience wrapper around `nk.vault.listFiles` that returns just the
 * `entries` array. The api-client returns `{ entries: [...] }`; almost every
 * caller wants the array directly.
 */
export async function listVaultFiles(
  nk: NoteKitApi,
  prefix: string,
): Promise<{ path: string; sha: string }[]> {
  const res = await nk.vault.listFiles(prefix);
  return res.entries;
}

/** Build a JSON content block — the most common tool response shape. */
export function jsonContent(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Return both `content` (text JSON for old clients) and
 * `structuredContent` (typed object for new MCP clients that look at the
 * 2025-06 schema field). The SDK only forwards `structuredContent` when
 * a tool has an `outputSchema`, so this is safe to use universally.
 */
export function jsonContentWithStructured<T extends Record<string, unknown>>(
  data: T,
) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}

/** Build a plain-text content block. */
export function textContent(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

/** Build an isError tool result with a human-readable message. */
export function errorContent(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

/**
 * True if `path` points at an end-to-end encrypted item file. The MCP
 * server cannot decrypt these — only the user's devices can — so search
 * and read tools skip them and surface a count instead.
 */
export function isEncryptedItemPath(path: string): boolean {
  return path.endsWith(".md.age");
}

/**
 * Standard envelope the LLM sees when a tool skipped encrypted items.
 * Encourages the assistant to surface the boundary to the user rather
 * than pretend the matches don't exist. Returns `undefined` when there
 * is nothing to report so callers can spread it conditionally.
 */
export function encryptedSkippedNote(
  count: number,
  kind: string,
): { encrypted_skipped: number; hint: string } | undefined {
  if (count <= 0) return undefined;
  return {
    encrypted_skipped: count,
    hint: `${count} encrypted ${kind}${count === 1 ? "" : "s"} were not searched. Encrypted items are only readable on the user's devices — ask the user to open them locally if needed.`,
  };
}
