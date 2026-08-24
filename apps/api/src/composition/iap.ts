/**
 * Composition root for the IAP verify + webhook use cases: binds them to the
 * driven Apple/Google verifiers and the Drizzle receipt repository, reusing the
 * wired `recomputePlusForUser` from the entitlement composition root. Routes
 * import the wired functions from here.
 */
import { appleReceiptVerifier } from "../adapters/driven/iap/appleReceiptVerifier";
import { googleSubscriptionVerifier } from "../adapters/driven/iap/googleSubscriptionVerifier";
import { iapReceiptRepository } from "../adapters/driven/iap/receiptRepository";
import { createHandleGoogleWebhook } from "../application/usecases/handleGoogleWebhook";
import { createVerifyAppleReceipt } from "../application/usecases/verifyAppleReceipt";
import { createVerifyGooglePurchase } from "../application/usecases/verifyGooglePurchase";
import { recomputePlusForUser } from "./entitlement";

export const verifyAppleReceipt = createVerifyAppleReceipt({
  verifier: appleReceiptVerifier,
  receipts: iapReceiptRepository,
  recomputePlusForUser,
});

export const verifyGooglePurchase = createVerifyGooglePurchase({
  verifier: googleSubscriptionVerifier,
  receipts: iapReceiptRepository,
  recomputePlusForUser,
});

export const handleGoogleWebhook = createHandleGoogleWebhook({
  verifier: googleSubscriptionVerifier,
  receipts: iapReceiptRepository,
  recomputePlusForUser,
});
