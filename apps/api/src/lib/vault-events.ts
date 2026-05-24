/**
 * In-process pub/sub for vault-change notifications.
 *
 * The SSE endpoint (GET /vault/events) subscribes per vault id; each call
 * to `publishVaultEvent` fans out synchronously to every subscriber on that
 * channel. Subscribers are SSE response streams, so writes happen on the
 * same tick — the publisher's request returns before any consumer's write
 * resolves (writes are queued in each subscriber, not awaited here).
 *
 * Scope is intentionally narrow: ephemeral, no durability, single-process
 * only. Two API instances behind a load balancer would each see only their
 * own writes; horizontal-scale fan-out slots in behind this interface later
 * (NATS / Redis pub/sub) without changing call sites.
 *
 * Auth is NOT enforced here — the SSE endpoint authenticates the request,
 * then resolves the caller's active vault id and only subscribes to that
 * channel. A leaked vault id alone can't subscribe.
 */

export type VaultEvent =
  | { type: "write"; path: string; sha: string }
  | { type: "delete"; path: string };

type Listener = (event: VaultEvent) => void;

const channels = new Map<string, Set<Listener>>();

/**
 * Subscribe to all future events on the given vault channel. Returns an
 * unsubscribe function — call it on stream teardown to avoid leaking the
 * listener (and, via its closure, the response object).
 */
export function subscribeVault(vaultId: string, listener: Listener): () => void {
  let set = channels.get(vaultId);
  if (!set) {
    set = new Set();
    channels.set(vaultId, set);
  }
  set.add(listener);
  return () => {
    const s = channels.get(vaultId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) channels.delete(vaultId);
  };
}

/**
 * Fan out an event to every subscriber on the channel. No-op when nobody
 * is listening — and every listener's exception is contained so a bad
 * subscriber can't poison the publisher's request handler.
 */
export function publishVaultEvent(vaultId: string, event: VaultEvent): void {
  const set = channels.get(vaultId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch (err) {
      console.error("[vault-events] listener threw:", err);
    }
  }
}
