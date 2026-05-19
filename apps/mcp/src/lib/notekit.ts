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
