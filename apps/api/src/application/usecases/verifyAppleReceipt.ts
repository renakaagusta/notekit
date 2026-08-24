import type { AppleReceiptVerifier } from "../ports/out/AppleReceiptVerifier";
import type { IapReceiptRepository } from "../ports/out/IapReceiptRepository";

/**
 * Verify an Apple transaction, persist the receipt, then recompute the user's
 * Plus entitlement. Order (lookup → upsert → recompute) and the returned
 * productId are identical to the previous inline route handler.
 */
export function createVerifyAppleReceipt(deps: {
  verifier: AppleReceiptVerifier;
  receipts: IapReceiptRepository;
  recomputePlusForUser: (userId: string) => Promise<void>;
}) {
  return async function verifyAppleReceipt(
    userId: string,
    transactionId: string,
  ): Promise<{ productId: string }> {
    const result = await deps.verifier.lookupTransaction(transactionId);
    await deps.receipts.upsertAppleReceipt(userId, {
      originalTransactionId: result.info.originalTransactionId,
      latestTransactionId: result.info.transactionId,
      productId: result.info.productId,
      expiresAt: result.info.expiresDate ?? null,
      environment: result.environment,
      rawJson: result.raw,
    });
    await deps.recomputePlusForUser(userId);
    return { productId: result.info.productId };
  };
}
