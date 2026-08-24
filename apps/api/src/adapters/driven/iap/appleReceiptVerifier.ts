import type { AppleReceiptVerifier } from "../../../application/ports/out/AppleReceiptVerifier";
import { lookupTransaction } from "./apple";

/** App Store Server API implementation of {@link AppleReceiptVerifier}. */
export const appleReceiptVerifier: AppleReceiptVerifier = {
  lookupTransaction(transactionId) {
    return lookupTransaction(transactionId);
  },
};
