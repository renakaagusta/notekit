import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { db, schema } from "../db";
import { env } from "../env";

const SESSION_COOKIE = "notekit_session";
const SESSION_TTL_MS = 60 * 60 * 24 * 30 * 1000; // 30 days

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = nanoid(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(schema.sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export function setSessionCookie(c: Context, sessionId: string, expiresAt: Date): void {
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    secure: env.isProd,
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export async function getCurrentUser(c: Context) {
  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) return null;

  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.userId),
  });
  return user ?? null;
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

export function getSessionId(c: Context): string | null {
  return getCookie(c, SESSION_COOKIE) ?? null;
}
