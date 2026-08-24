/**
 * Gravatar-compatible avatar forwarder.
 *
 * Forgejo (and any other consumer with a configurable avatar fallback URL)
 * can point at this endpoint to render agent avatars. The URL shape mirrors
 * Gravatar's: `GET /avatar/<md5-of-lowercased-email>`.
 *
 * Behavior: 302-redirect to `gravatar.com/avatar/<hash>` with an identicon
 * as the `d=` fallback. So:
 *   - If Gravatar has an image for that email → it's served (the user's
 *     uploaded photo for emails they've registered).
 *   - If not → Gravatar's identicon is served (deterministic per hash).
 *
 * NoteKit no longer stores per-agent avatar URLs; the agent's email +
 * Gravatar registration is the single source of truth. Register the
 * agent's email at https://gravatar.com to give it a profile picture.
 *
 * Public endpoint, no auth — the hash is one-way and nothing leaks here
 * that isn't already in a commit author field.
 */

import { Hono } from "hono";

export const avatarRoutes = new Hono();

avatarRoutes.get("/:hash", (c) => {
  const hash = c.req
    .param("hash")
    .toLowerCase()
    .replace(/\.(svg|png|jpe?g|webp|gif)$/i, "");
  const size = c.req.query("s") ?? c.req.query("size") ?? "256";
  // 302 → Gravatar. Identicon is the standard, stable visual for unknown
  // emails; aligns with how GitHub renders Gravatar 404s.
  const url = `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${encodeURIComponent(size)}`;
  c.header("Cache-Control", "public, max-age=3600");
  return c.redirect(url, 302);
});
