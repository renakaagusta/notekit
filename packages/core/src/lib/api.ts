/**
 * apiFetch — used by every typed wrapper in this folder (vault-api.ts,
 * agents-api.ts, notifications-api.ts) to talk to the @notekit/api server
 * from the browser.
 *
 * It is a thin compatibility shim over the shared NoteKitClient transport
 * from @notekit/api-client. CLI / desktop / MCP construct their own client
 * with bearer auth; the web app uses cookies via this module.
 *
 * Migration goal (incremental): new code should import typed methods from
 * @notekit/api-client directly (`nk.vault.listVaults()` etc.) instead of
 * calling apiFetch by hand. The wrappers in this folder will keep working
 * during the migration.
 */
import { NoteKitClient, createNoteKitClient, type NoteKitApi } from "@notekit/api-client";

interface ViteImportMeta {
  env?: { VITE_API_URL?: string };
}

function resolveApiUrl(): string {
  const meta = typeof import.meta !== "undefined" ? (import.meta as ViteImportMeta) : null;
  const fromEnv = meta?.env?.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  return "http://localhost:3001";
}

export const apiUrl: string = resolveApiUrl();

/**
 * The typed API client. New components should use this directly:
 *
 *     import { nk } from "../lib/api";
 *     const { tokens } = await nk.auth.listTokens();
 *
 * Falls back to `apiFetch` (defined below) only for legacy callers in this
 * folder's *-api.ts wrappers — those still work but should migrate.
 */
export const nk: NoteKitApi = createNoteKitClient({
  baseUrl: apiUrl,
  auth: { mode: "cookie" },
});

const client: NoteKitClient = nk.client;

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Backwards-compatible signature: callers pass a Fetch-style `RequestInit`
 * with a JSON string body, we translate it into the transport's typed form.
 * FormData payloads (rare) fall back to a direct fetch so we don't lose the
 * multipart boundary.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase() as Method;

  if (init.body instanceof FormData) {
    const res = await fetch(`${apiUrl}${path}`, {
      credentials: "include",
      ...init,
    });
    if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }

  // All existing *-api.ts wrappers in this folder pass JSON-stringified
  // bodies. A non-JSON string body would have been double-encoded by the
  // transport's JSON.stringify call below — throw early so a future caller
  // that forgets to stringify gets a clear error instead of a silently
  // malformed wire payload.
  let body: unknown;
  if (typeof init.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch (err) {
      throw new TypeError(
        `apiFetch: string body must be JSON-encoded (got: ${init.body.slice(0, 40)}...): ${(err as Error).message}`,
      );
    }
  } else if (init.body !== undefined && init.body !== null) {
    body = init.body;
  }

  return client.request<T>(path, { method, body });
}
