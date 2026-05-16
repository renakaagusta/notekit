/**
 * Minimal API client. Resolves the API base URL from VITE_API_URL with a
 * sensible localhost fallback so the dev experience needs zero config.
 */
function resolveApiUrl(): string {
  const fromEnv =
    typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  return "http://localhost:3001";
}

export const apiUrl: string = resolveApiUrl();

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
