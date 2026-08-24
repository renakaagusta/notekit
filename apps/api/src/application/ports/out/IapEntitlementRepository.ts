import type { PlusSource } from "../../../domain/entitlement";

/**
 * Outbound port for the IAP entitlement store. The recompute use case depends on
 * this instead of Drizzle, so the Postgres queries live in a driven adapter.
 */
export interface IapEntitlementRepository {
  /** Latest Apple receipt expiry (ms epoch) for the user, or null. */
  getLatestAppleExpiry(userId: string): Promise<number | null>;
  /** Latest Google purchase expiry (ms epoch) for the user, or null. */
  getLatestGoogleExpiry(userId: string): Promise<number | null>;
  /** The user's current plusSource (to preserve lifetime/stripe grants). */
  getUserPlusSource(userId: string): Promise<string | null | undefined>;
  /** Persist the recomputed plus state onto the user row. */
  setUserPlus(
    userId: string,
    plus: { plusUntil: number | null; plusSource: PlusSource | null; plan: "plus" | "free" },
  ): Promise<void>;
}
