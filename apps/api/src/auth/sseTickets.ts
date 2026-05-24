/**
 * Short-lived, single-use tickets that let a client open an SSE stream via
 * a query parameter instead of an Authorization header. Native EventSource
 * can't send custom headers, so bearer-only clients (CLI, MCP, desktop on
 * keychain bearer) can't auth a `GET /vault/events` directly. They mint a
 * ticket with their normal bearer credential (POST is fine — fetch sends
 * headers), then open EventSource(`/vault/events?ticket=<ticket>`).
 *
 * Storage is in-memory and process-local. Tickets expire after a short
 * window and are removed on first use. Two API instances behind a load
 * balancer would not share tickets — for now that's fine because the SSE
 * pub/sub itself is single-process; both will need the same backend swap
 * (e.g. Redis) at the same time.
 */
import { randomBytes } from "node:crypto";

const TICKET_PREFIX = "nks_"; // "notekit sse"
const TICKET_TTL_MS = 60_000; // 60s — generous for slow networks, still short.
const MAX_OUTSTANDING = 10_000; // bound the map; well above realistic load.

interface Ticket {
  userId: string;
  expiresAt: number;
}

const tickets = new Map<string, Ticket>();
let lastSweep = 0;

/**
 * Mint a ticket bound to the given user. The plaintext is returned only
 * here; the in-memory store keeps just the ticket string + user + expiry.
 */
export function issueSseTicket(userId: string): { ticket: string; expiresAt: Date } {
  sweepIfStale();
  if (tickets.size >= MAX_OUTSTANDING) {
    // Hard backpressure. Mint failures translate to a 503 at the route;
    // legitimate callers retry. Lets us bound memory without admitting
    // anyone capable of triggering an OOM by polling the mint endpoint.
    throw new Error("ticket_pool_full");
  }
  const ticket = `${TICKET_PREFIX}${randomBytes(24).toString("hex")}`;
  const expiresAt = Date.now() + TICKET_TTL_MS;
  tickets.set(ticket, { userId, expiresAt });
  return { ticket, expiresAt: new Date(expiresAt) };
}

/**
 * Look up and CONSUME a ticket. Single-use: once redeemed, a second call
 * with the same ticket returns null. Expired tickets also return null.
 */
export function redeemSseTicket(ticket: string | undefined | null): { userId: string } | null {
  if (!ticket || !ticket.startsWith(TICKET_PREFIX)) return null;
  const row = tickets.get(ticket);
  if (!row) return null;
  tickets.delete(ticket);
  if (row.expiresAt < Date.now()) return null;
  return { userId: row.userId };
}

/**
 * Drop expired tickets if it's been a while since the last sweep. Called
 * opportunistically on mint to keep the cleanup cost amortized; on a fully
 * idle process the map just sits with stale entries that fail redeem.
 */
function sweepIfStale(): void {
  const now = Date.now();
  if (now - lastSweep < TICKET_TTL_MS) return;
  lastSweep = now;
  for (const [t, row] of tickets) {
    if (row.expiresAt < now) tickets.delete(t);
  }
}
