/**
 * Client-side wrapper for the /vault/events SSE stream.
 *
 * Opens an EventSource pointing at the API, forwards each `write` / `delete`
 * event to the sync engine's `refresh()`, and reconnects with exponential
 * backoff on disconnect. A single global stream — only one is needed since
 * the server picks the channel from the caller's active vault.
 *
 * Two auth modes:
 *   - Cookie:   no `mintTicket` opt. EventSource is opened with
 *               `withCredentials: true` so the browser sends the session
 *               cookie. Used by web / mobile-webview / desktop-cookie.
 *   - Bearer:   pass `mintTicket` — a callback that returns a fresh ticket
 *               string from `POST /vault/events/ticket`. Each reconnect
 *               mints a new ticket because they're single-use. Used by
 *               CLI / MCP / desktop-PAT shells whose transport doesn't
 *               propagate cookies.
 */
import { apiUrl } from "./api";
import { refresh as refreshSync } from "./sync";

export interface StartVaultEventStreamOptions {
  /**
   * Optional ticket minter. Provide for bearer-auth clients; omit for
   * cookie-auth clients. The callback runs on every connect attempt and
   * must use whatever transport the caller has access to (e.g. a bearer-
   * mode NoteKitClient) to call `POST /vault/events/ticket`.
   */
  mintTicket?: () => Promise<string>;
}

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = 1000;
const MAX_BACKOFF_MS = 30_000;
let stopped = true;
let activeOptions: StartVaultEventStreamOptions = {};

/**
 * Open the event stream. Idempotent — calling twice in a row is a no-op
 * if the existing stream is still connecting or open.
 */
export function startVaultEventStream(opts: StartVaultEventStreamOptions = {}): void {
  if (typeof EventSource === "undefined") return; // SSR / Node test env
  stopped = false;
  activeOptions = opts;
  if (eventSource) return;
  void open();
}

/**
 * Close the event stream and cancel any pending reconnect. Safe to call
 * even if nothing is open (idempotent).
 */
export function stopVaultEventStream(): void {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  backoffMs = 1000;
}

async function open(): Promise<void> {
  let url = `${apiUrl.replace(/\/$/, "")}/vault/events`;
  let withCredentials = true;

  // Bearer path: mint a single-use ticket and pass it on the URL. Native
  // EventSource can't send Authorization headers, so this is how a
  // bearer-only client authenticates the stream.
  if (activeOptions.mintTicket) {
    try {
      const ticket = await activeOptions.mintTicket();
      url += `?ticket=${encodeURIComponent(ticket)}`;
      // No cookies needed once we're using a ticket — and on cross-origin
      // bearer setups, withCredentials would fail CORS preflight anyway.
      withCredentials = false;
    } catch (err) {
      console.warn("[vault-events] ticket mint failed", err);
      scheduleReconnect();
      return;
    }
  }

  let es: EventSource;
  try {
    es = new EventSource(url, { withCredentials });
  } catch (err) {
    console.warn("[vault-events] EventSource construct failed", err);
    scheduleReconnect();
    return;
  }
  eventSource = es;

  // Both event types collapse to the same client action: ask the sync
  // engine to refresh. refresh() debounces + gates internally so a burst
  // of events doesn't become a burst of pulls.
  const onChange = () => {
    void refreshSync();
  };
  es.addEventListener("write", onChange);
  es.addEventListener("delete", onChange);

  es.addEventListener("ready", () => {
    // Reset backoff once the server has accepted the connection — any
    // subsequent reconnect cycle should start from 1s again.
    backoffMs = 1000;
  });

  // Heartbeats need no handler; the EventSource itself notices the bytes
  // and keeps the connection healthy. Their only purpose is to defeat
  // idle-timeout proxies.

  es.onerror = () => {
    // EventSource auto-reconnects on its own for some failure modes, but
    // explicit close + manual reconnect gives us deterministic backoff
    // and lets the bearer path mint a fresh ticket per attempt.
    es.close();
    if (eventSource === es) eventSource = null;
    if (!stopped) scheduleReconnect();
  };
}

function scheduleReconnect(): void {
  if (stopped || reconnectTimer) return;
  const delay = backoffMs;
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (stopped) return;
    void open();
  }, delay);
}
