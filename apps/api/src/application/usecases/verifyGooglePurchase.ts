import type { GoogleSubscriptionVerifier } from "../ports/out/GoogleSubscriptionVerifier";
import type { IapReceiptRepository } from "../ports/out/IapReceiptRepository";

/**
 * Verify a Google Play purchase, persist it, then recompute the user's Plus
 * entitlement. Order (lookup → upsert → recompute) and the returned productId
 * are identical to the previous inline route handler.
 */
export function createVerifyGooglePurchase(deps: {
  verifier: GoogleSubscriptionVerifier;
  receipts: IapReceiptRepository;
  recomputePlusForUser: (userId: string) => Promise<void>;
}) {
  return async function verifyGooglePurchase(
    userId: string,
    purchaseToken: string,
  ): Promise<{ productId: string }> {
    const state = await deps.verifier.lookupSubscription(purchaseToken);
    await deps.receipts.upsertGooglePurchase(userId, purchaseToken, {
      productId: state.productId,
      expiresAt: state.expiresAt ?? null,
      acknowledged: state.acknowledged,
      rawJson: JSON.stringify(state.raw),
    });
    await deps.recomputePlusForUser(userId);
    return { productId: state.productId };
  };
}
