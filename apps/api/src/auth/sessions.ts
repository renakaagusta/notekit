import type { Context } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { nanoid } from "nanoid";
import type { SessionRepository } from "../application/ports/out/SessionRepository";
import { getPatPrincipal } from "../composition/personalTokens";
import { env } from "../env";

const SESSION_COOKIE = "notekit_session";
const SESSION_TTL_MS = 60 * 60 * 24 * 30 * 1000; // 30 days

let repo: SessionRepository;

/**
 * Bind the session persistence port. Called once from the composition root
 * before any route handler runs; importers pull the session functions from
 * that root so the wiring is guaranteed to have happened first.
 */
export function configureSessions(r: SessionRepository): void {
  repo = r;
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = nanoid(32);
  const expiresAtMs = Date.now() + SESSION_TTL_MS;
  await repo.insertSession(id, userId, expiresAtMs);
  return { id, expiresAt: new Date(expiresAtMs) };
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

/**
 * Resolve the current user from either:
 *   1. `Authorization: Bearer nkp_…` (personal access token — CLI / MCP)
 *   2. The `notekit_session` cookie (web / mobile / desktop webview)
 *
 * Bearer is tried first so a call that carries both (rare; e.g. a logged-in
 * browser tab pasting a token into a fetch) prefers the explicit credential.
 * Routes that must be cookie-only (signout, OAuth callbacks) read the cookie
 * directly via `getSessionId` instead of calling this.
 */
export async function getCurrentUser(c: Context) {
  const pat = await getPatPrincipal(c);
  if (pat) {
    const user = await repo.findUserById(pat.userId);
    return user ?? null;
  }

  const sessionId = getCookie(c, SESSION_COOKIE);
  if (!sessionId) return null;

  const session = await repo.findSessionById(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    await repo.deleteSession(sessionId);
    return null;
  }

  const user = await repo.findUserById(session.userId);
  return user ?? null;
}

export async function destroySession(sessionId: string): Promise<void> {
  await repo.deleteSession(sessionId);
}

export function getSessionId(c: Context): string | null {
  return getCookie(c, SESSION_COOKIE) ?? null;
}

/**
 * Cookie-ONLY user lookup. Use this for endpoints that manage credentials
 * themselves (PAT mint/list/revoke, `POST /auth/cli/authorize`) so that a
 * stolen PAT cannot mint more PATs or revoke its predecessors.
 *
 * The general `getCurrentUser` accepts either cookie or bearer — that's the
 * right default for read/write endpoints on user data, but it would let a
 * leaked bearer perpetuate itself if applied to credential management.
 */
export async function getSessionUser(c: Context) {
  const sessionId = getSessionId(c);
  if (!sessionId) return null;

  const session = await repo.findSessionById(sessionId);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    await repo.deleteSession(sessionId);
    return null;
  }

  const user = await repo.findUserById(session.userId);
  return user ?? null;
}
