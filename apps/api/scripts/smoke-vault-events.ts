/**
 * Smoke test for the vault-events bus and the SSE ticket store.
 *
 * Run with: `pnpm --filter @notekit/api exec tsx scripts/smoke-vault-events.ts`
 *
 * No DB or HTTP server needed — this exercises the two pure-memory modules
 * the SSE endpoint depends on, so we know the substrate works before
 * pointing curl at a running server (see scripts/smoke-vault-events.sh).
 */
import {
  publishVaultEvent,
  subscribeVault,
  type VaultEvent,
} from "../src/lib/vault-events.js";
import {
  issueSseTicket,
  redeemSseTicket,
} from "../src/auth/sseTickets.js";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ─── bus contract ────────────────────────────────────────────────────────
console.log("vault-events bus:");
{
  const seenA: VaultEvent[] = [];
  const seenB: VaultEvent[] = [];
  const offA = subscribeVault("vault-1", (e) => seenA.push(e));
  const offB = subscribeVault("vault-1", (e) => seenB.push(e));
  subscribeVault("vault-2", () => {
    throw new Error("vault-2 listener must not see vault-1 events");
  });

  publishVaultEvent("vault-1", { type: "write", path: "notes/a.md", sha: "abc" });
  check("both listeners on the same channel receive the event", seenA.length === 1 && seenB.length === 1);
  check("event payload is preserved", seenA[0]?.type === "write" && seenA[0].path === "notes/a.md");

  offA();
  publishVaultEvent("vault-1", { type: "delete", path: "notes/a.md" });
  check("unsubscribed listener no longer fires", seenA.length === 1 && seenB.length === 2);

  publishVaultEvent("vault-3", { type: "write", path: "x", sha: "y" });
  check("publish to channel with no subscribers is a no-op", true);

  // Listener exceptions must not poison the publisher.
  const offC = subscribeVault("vault-4", () => {
    throw new Error("intentional");
  });
  let downstreamReached = false;
  subscribeVault("vault-4", () => {
    downstreamReached = true;
  });
  publishVaultEvent("vault-4", { type: "write", path: "p", sha: "s" });
  check("a throwing listener doesn't break downstream listeners", downstreamReached);
  offC();
  offB();
}

// ─── ticket store ───────────────────────────────────────────────────────
console.log("SSE ticket store:");
{
  const issued = issueSseTicket("user-1");
  check("ticket starts with nks_", issued.ticket.startsWith("nks_"));
  check("expiresAt is in the future", issued.expiresAt.getTime() > Date.now());

  const redeemed = redeemSseTicket(issued.ticket);
  check("first redeem returns the user", redeemed?.userId === "user-1");

  const second = redeemSseTicket(issued.ticket);
  check("second redeem of the same ticket returns null (single-use)", second === null);

  const garbage = redeemSseTicket("not_a_real_ticket");
  check("redeeming an unknown ticket returns null", garbage === null);

  const wrongPrefix = redeemSseTicket("nkp_aaaaa");
  check("ticket with wrong prefix is rejected", wrongPrefix === null);

  const empty = redeemSseTicket(undefined);
  check("redeeming undefined returns null", empty === null);
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed.");
