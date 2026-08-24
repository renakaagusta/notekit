import { eq } from "drizzle-orm";
import type { SessionRepository } from "../../../application/ports/out/SessionRepository";
import { db, schema } from "../db";

/** Drizzle/Postgres implementation of {@link SessionRepository}. */
export const sessionRepository: SessionRepository = {
  async insertSession(id, userId, expiresAtMs) {
    await db.insert(schema.sessions).values({ id, userId, expiresAt: expiresAtMs });
  },
  async findSessionById(id) {
    const session = await db.query.sessions.findFirst({
      where: eq(schema.sessions.id, id),
    });
    if (!session) return null;
    return { userId: session.userId, expiresAt: session.expiresAt };
  },
  async deleteSession(id) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
  },
  async findUserById(userId) {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    return user ?? null;
  },
};
