/**
 * The user entity as auth and the surfaces consume it. Mirrors the `users`
 * table row so the driven adapter can return a Drizzle row unchanged while the
 * application layer stays free of any adapter/Drizzle import (dependency rule:
 * `application/` may only see `domain/`).
 */
export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  plan: "free" | "plus" | "lifetime";
  plusUntil: number | null;
  plusSource: "apple" | "google" | "stripe" | "lifetime" | null;
  createdAt: number;
}
