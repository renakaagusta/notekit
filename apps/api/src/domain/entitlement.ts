/**
 * Plus-entitlement domain rules. Pure: given a user's stored plus fields,
 * decide whether they currently have Plus. No I/O — the recompute-from-receipts
 * use case that writes these fields lives in the application layer.
 */
export type PlusSource = "apple" | "google" | "stripe" | "lifetime";

export function isPlus(user: {
  plusUntil?: number | null;
  plusSource?: string | null;
}): boolean {
  if (user.plusSource === "lifetime") return true;
  if (!user.plusUntil) return false;
  return user.plusUntil > Date.now();
}
