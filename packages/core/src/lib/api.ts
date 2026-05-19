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
import { NoteKitClient } from "@notekit/api-client";

function resolveApiUrl(): string {
  const fromEnv =
    typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  return "http://localhost:3001";
}

export const apiUrl: string = resolveApiUrl();

const client = new NoteKitClient({
  baseUrl: apiUrl,
  auth: { mode: "cookie" },
});

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

  let body: unknown;
  if (typeof init.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = init.body;
    }
  } else if (init.body !== undefined && init.body !== null) {
    body = init.body;
  }

  return client.request<T>(path, { method, body });
}
