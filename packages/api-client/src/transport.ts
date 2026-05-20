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

/**
 * Per-request options. Named `NoteKitRequestInit` (not `RequestInit`) so it
 * doesn't shadow the global Fetch RequestInit — the two have different
 * shapes and confusing them is easy if both names are in scope.
 */
export interface NoteKitRequestInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON-encoded by default. Set `form: true` to send as x-www-form-urlencoded. */
  body?: unknown;
  /**
   * When true, `body` must be a record of scalar values; we encode it as
   * `application/x-www-form-urlencoded`. Used only by OAuth token exchange.
   */
  form?: boolean;
}

/** Legacy alias kept for compatibility — prefer `NoteKitRequestInit`. */
export type RequestInit = NoteKitRequestInit;

/** Value types we accept in a form-encoded body. Reject everything else. */
type FormScalar = string | number | boolean;

export class NoteKitClient {
  /**
   * Bind once at construction so a fetch installed onto globalThis (by a
   * browser extension, by an undici polyfill, etc.) works without the
   * "Illegal invocation" error you get when calling a `fetch` method on the
   * wrong receiver. The `bind` would also work in the getter — but doing
   * it once here avoids re-binding on every request.
   */
  private readonly fetchFn: typeof fetch;

  constructor(public readonly opts: NoteKitClientOptions) {
    const f = opts.fetch ?? globalThis.fetch;
    this.fetchFn = f.bind(globalThis);
  }

  async request<T = unknown>(path: string, init: NoteKitRequestInit = {}): Promise<T> {
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
        body = encodeForm(init.body);
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
      const code = extractErrorCode(parsed);
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

/**
 * Pull a string `.error` out of a response body without trusting the shape.
 * Anything else — non-object, missing key, nested object — collapses to
 * "unknown_error" so the thrown NoteKitApiError carries a sane string code
 * instead of `[object Object]`.
 */
function extractErrorCode(parsed: unknown): string {
  if (
    parsed !== null &&
    typeof parsed === "object" &&
    "error" in parsed &&
    typeof (parsed as { error: unknown }).error === "string"
  ) {
    return (parsed as { error: string }).error;
  }
  return "unknown_error";
}

/**
 * Encode a flat scalar map as `application/x-www-form-urlencoded`. Throws on
 * a non-record body or non-scalar values rather than silently producing
 * `String(undefined)` (= "undefined") or `String({})` (= "[object Object]")
 * the way a blanket coercion would.
 */
function encodeForm(body: unknown): string {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new TypeError("form bodies must be a record of scalar values");
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
      throw new TypeError(`form value for "${k}" must be string | number | boolean`);
    }
    params.set(k, String(v as FormScalar));
  }
  return params.toString();
}
