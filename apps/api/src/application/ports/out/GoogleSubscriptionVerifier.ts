/**
 * Outbound port for verifying a Google Play subscription against the Google Play
 * Developer API. Implemented by the driven Google adapter; the verify use case
 * depends on this instead of importing the adapter directly.
 */
export interface GoogleSubscriptionState {
  productId: string;
  expiresAt: number;
  acknowledged: boolean;
  raw: unknown;
}

export interface GoogleSubscriptionVerifier {
  lookupSubscription(purchaseToken: string): Promise<GoogleSubscriptionState>;
}
