import type { User } from "../../../domain/user";

/**
 * Outbound port for session persistence. Auth depends on this instead of
 * Drizzle so the session/user queries live in a driven adapter and the auth
 * logic can be exercised with an in-memory fake.
 */
export interface SessionRepository {
  /** Persist a new session with its absolute expiry (epoch milliseconds). */
  insertSession(id: string, userId: string, expiresAtMs: number): Promise<void>;

  /**
   * The session's owner and expiry (epoch milliseconds), or null when no
   * session with that id exists.
   */
  findSessionById(id: string): Promise<{ userId: string; expiresAt: number } | null>;

  /** Remove a session by id (used on sign-out and on expiry). */
  deleteSession(id: string): Promise<void>;

  /** The user for the given id, or null when none exists. */
  findUserById(userId: string): Promise<User | null>;
}
