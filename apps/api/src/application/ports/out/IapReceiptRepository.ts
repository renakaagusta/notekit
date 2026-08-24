/**
 * Outbound port for persisting IAP receipts/purchases. The verify + webhook use
 * cases depend on this instead of Drizzle, so the Postgres upserts and lookups
 * live in a driven adapter. Shapes and behaviour are identical to the previous
 * inline `upsertAppleReceipt` / `upsertGooglePurchase` helpers.
 */
export interface AppleReceiptRecord {
  originalTransactionId: string;
  latestTransactionId: string;
  productId: string;
  expiresAt: number | null;
  environment: "sandbox" | "production";
  rawJson: string;
}

export interface GooglePurchaseRecord {
  productId: string;
  expiresAt: number | null;
  acknowledged: boolean;
  rawJson: string;
}

export interface IapReceiptRepository {
  /** Upsert an Apple receipt row for the user (conflict on originalTransactionId). */
  upsertAppleReceipt(userId: string, receipt: AppleReceiptRecord): Promise<void>;
  /** Upsert a Google purchase row for the user (conflict on purchaseToken). */
  upsertGooglePurchase(
    userId: string,
    purchaseToken: string,
    purchase: GooglePurchaseRecord,
  ): Promise<void>;
  /** Find the userId that owns a Google purchase token, or null if unknown. */
  findGooglePurchaseOwner(purchaseToken: string): Promise<string | null>;
}
