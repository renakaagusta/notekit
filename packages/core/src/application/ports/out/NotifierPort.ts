/**
 * Outbound port for vault event notifications. Use cases depend on this instead
 * of managing EventSource directly, so the notification transport is injectable
 * and can be replaced by the composition root (mock in tests, SSE in the browser,
 * WebSocket in native apps, etc).
 */

export interface StartVaultEventStreamOptions {
  /**
   * Optional ticket minter. Provide for bearer-auth clients; omit for
   * cookie-auth clients. The callback runs on every connect attempt and
   * must use whatever transport the caller has access to (e.g. a bearer-
   * mode NoteKitClient) to call `POST /vault/events/ticket`.
   */
  mintTicket?: () => Promise<string>;
}

export interface NotifierPort {
  /**
   * Open the event stream. Idempotent — calling twice in a row is a no-op
   * if the existing stream is still connecting or open.
   */
  start(opts?: StartVaultEventStreamOptions): void;

  /**
   * Close the event stream and cancel any pending reconnect. Safe to call
   * even if nothing is open (idempotent).
   */
  stop(): void;
}
