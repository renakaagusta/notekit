import type { PlusSource } from "../../domain/entitlement";
import type { IapEntitlementRepository } from "../ports/out/IapEntitlementRepository";

/**
 * Recompute a user's Plus entitlement from their latest Apple/Google receipts.
 * Lifetime/stripe grants are preserved (never downgraded here). Behaviour is
 * identical to the previous iap/entitlement implementation; it now reads/writes
 * through the injected {@link IapEntitlementRepository} instead of Drizzle.
 */
export function createRecomputePlusForUser(repo: IapEntitlementRepository) {
  return async function recomputePlusForUser(userId: string): Promise<void> {
    const [apple, google] = await Promise.all([
      repo.getLatestAppleExpiry(userId),
      repo.getLatestGoogleExpiry(userId),
    ]);

    let best: { expiresAt: number; source: PlusSource } | null = null;
    if (apple) best = { expiresAt: apple, source: "apple" };
    if (google && (!best || google > best.expiresAt)) {
      best = { expiresAt: google, source: "google" };
    }

    const plusSource = await repo.getUserPlusSource(userId);
    if (plusSource === "lifetime" || plusSource === "stripe") return;

    await repo.setUserPlus(userId, {
      plusUntil: best?.expiresAt ?? null,
      plusSource: best?.source ?? null,
      plan: best ? "plus" : "free",
    });
  };
}
