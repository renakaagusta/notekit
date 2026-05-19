// Low-level HTTP transport. Each surface configures one NoteKitClient with
// the appropriate auth strategy:
//   - web:     credentials: "include"  (session cookie)
//   - cli:     getToken: read from OS keychain   (bearer)
//   - desktop: getToken: read from OS keychain   (bearer)
//   - mcp:     getToken: read from env / config  (bearer)
//
// Keeping the transport tiny means we never grow a parallel fetch wrapper per
// surface — every endpoint helper goes through `request()`.

import { NoteKitApiError, NoteKitAuthError, NoteKitNetworkError } from "./errors";

export interface NoteKitClientOptions {
  /** Base URL of the API, e.g. http://localhost:3001 or https://api.notekit.app. */
  baseUrl: string;
  /**
   * Auth strategy.
   *   - "cookie": send credentials: "include" (web / desktop loading webview).
   *   - "bearer": call getToken() and send Authorization: Bearer <token>.
   */
  auth: { mode: "cookie" } | { mode: "bearer"; getToken: () => Promise<string | null> | string | null };
  /** Optional custom fetch (node-fetch, undici, etc.) — defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Hook for logging / instrumentation. Called before every request. */
  onRequest?: (req: { method: string; url: string }) => void;
}

export interface RequestInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Send body as form-encoded instead of JSON. Rare; used by OAuth token exchange. */
  form?: boolean;
}

export class NoteKitClient {
  constructor(public readonly opts: NoteKitClientOptions) {}

  private get fetchFn(): typeof fetch {
    // Bind to globalThis so extension-wrapped fetches (Tampermonkey, privacy
    // tools) don't throw "Illegal invocation" when called as a method.
    const f = this.opts.fetch ?? globalThis.fetch;
    return f.bind(globalThis);
  }

  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const url = new URL(path, this.opts.baseUrl);
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {};
    let body: BodyInit | undefined;

    if (init.body !== undefined) {
      if (init.form) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        const form = new URLSearchParams();
        for (const [k, v] of Object.entries(init.body as Record<string, string>)) {
          form.set(k, String(v));
        }
        body = form.toString();
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(init.body);
      }
    }

    if (this.opts.auth.mode === "bearer") {
      const token = await this.opts.auth.getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    this.opts.onRequest?.({ method: init.method ?? "GET", url: url.toString() });

    let res: Response;
    try {
      res = await this.fetchFn(url.toString(), {
        method: init.method ?? "GET",
        headers,
        body,
        credentials: this.opts.auth.mode === "cookie" ? "include" : "omit",
      });
    } catch (err) {
      throw new NoteKitNetworkError(`network error calling ${url.toString()}`, err);
    }

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    const parsed = text ? safeJson(text) : undefined;

    if (!res.ok) {
      if (res.status === 401) throw new NoteKitAuthError();
      const code = (parsed as { error?: string })?.error ?? "unknown_error";
      throw new NoteKitApiError(res.status, code, `${res.status} ${code}`, parsed);
    }

    return parsed as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
