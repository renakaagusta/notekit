/**
 * Outbound port for verifying an Apple transaction against the App Store Server
 * API. Implemented by the driven Apple adapter; the verify use case depends on
 * this instead of importing the adapter directly.
 */
export interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  expiresDate?: number;
}

export interface AppleVerificationResult {
  info: AppleTransactionInfo;
  environment: "sandbox" | "production";
  raw: string;
}

export interface AppleReceiptVerifier {
  lookupTransaction(transactionId: string): Promise<AppleVerificationResult>;
}
