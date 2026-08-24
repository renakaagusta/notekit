import type { GoogleSubscriptionVerifier } from "../ports/out/GoogleSubscriptionVerifier";
import type { IapReceiptRepository } from "../ports/out/IapReceiptRepository";

/**
 * Handle a Google Play RTDN webhook for a subscription purchase token: only
 * re-verify and persist tokens we already know, then recompute entitlement.
 * Unknown tokens are ignored (returns silently). Order (find owner → lookup →
 * upsert → recompute) is identical to the previous inline route handler.
 */
export function createHandleGoogleWebhook(deps: {
  verifier: GoogleSubscriptionVerifier;
  receipts: IapReceiptRepository;
  recomputePlusForUser: (userId: string) => Promise<void>;
}) {
  return async function handleGoogleWebhook(purchaseToken: string): Promise<void> {
    const userId = await deps.receipts.findGooglePurchaseOwner(purchaseToken);
    if (!userId) return;
    const state = await deps.verifier.lookupSubscription(purchaseToken);
    await deps.receipts.upsertGooglePurchase(userId, purchaseToken, {
      productId: state.productId,
      expiresAt: state.expiresAt ?? null,
      acknowledged: state.acknowledged,
      rawJson: JSON.stringify(state.raw),
    });
    await deps.recomputePlusForUser(userId);
  };
}
