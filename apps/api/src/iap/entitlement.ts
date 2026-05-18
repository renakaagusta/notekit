/**
 * Compute and persist Plus entitlement for a user.
 *
 * The truth is the latest receipt: pick the maximum `expiresAt` across all
 * non-revoked Apple + Google rows (lifetime web purchases write a far-future
 * expiry too — uniform model, no special cases). `users.plusUntil` mirrors
 * that max so the hot path can ignore IAP tables entirely.
 */
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db";

export type PlusSource = "apple" | "google" | "stripe" | "lifetime";

export async function recomputePlusForUser(userId: string): Promise<void> {
  const [latestApple, latestGoogle] = await Promise.all([
    db.query.appleIapReceipts.findFirst({
      where: eq(schema.appleIapReceipts.userId, userId),
      orderBy: [desc(schema.appleIapReceipts.expiresAt)],
    }),
    db.query.googleIapPurchases.findFirst({
      where: eq(schema.googleIapPurchases.userId, userId),
      orderBy: [desc(schema.googleIapPurchases.expiresAt)],
    }),
  ]);

  let best: { expiresAt: Date; source: PlusSource } | null = null;
  if (latestApple?.expiresAt) {
    best = { expiresAt: latestApple.expiresAt, source: "apple" };
  }
  if (
    latestGoogle?.expiresAt &&
    (!best || latestGoogle.expiresAt > best.expiresAt)
  ) {
    best = { expiresAt: latestGoogle.expiresAt, source: "google" };
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  // Preserve a manually-set lifetime entitlement.
  if (user?.plusSource === "lifetime" || user?.plusSource === "stripe") {
    return;
  }
  await db
    .update(schema.users)
    .set({
      plusUntil: best?.expiresAt ?? null,
      plusSource: best?.source ?? null,
      plan: best ? "plus" : "free",
    })
    .where(eq(schema.users.id, userId))
    .run();
}

export function isPlus(user: {
  plusUntil?: Date | null;
  plusSource?: string | null;
}): boolean {
  if (user.plusSource === "lifetime") return true;
  if (!user.plusUntil) return false;
  return user.plusUntil.getTime() > Date.now();
}
