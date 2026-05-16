import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { nanoid } from "nanoid";
import { env, providerConfigured } from "../env";
import { getProvider, type ProviderName } from "../auth/providers";
import {
  createSession,
  setSessionCookie,
  clearSessionCookie,
  getCurrentUser,
  destroySession,
  getSessionId,
} from "../auth/sessions";
import { upsertUserFromOAuth } from "../auth/upsert";

const STATE_COOKIE = "notekit_oauth_state";

export const authRoutes = new Hono();

function isProviderName(p: string): p is ProviderName {
  return p === "github" || p === "google";
}

/**
 * GET /auth/me — current user (or null)
 */
authRoutes.get("/me", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ user: null });

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      plan: user.plan,
    },
  });
});

/**
 * GET /auth/providers — which OAuth providers are configured server-side
 */
authRoutes.get("/providers", (c) => {
  return c.json({
    github: providerConfigured("github"),
    google: providerConfigured("google"),
  });
});

/**
 * POST /auth/signout — destroy session and clear cookie
 */
authRoutes.post("/signout", async (c) => {
  const sessionId = getSessionId(c);
  if (sessionId) await destroySession(sessionId);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

/**
 * GET /auth/:provider/callback
 * Receive the auth code, exchange for token, fetch profile, create session, redirect home.
 *
 * NOTE: This must be declared BEFORE the bare /:provider route so that
 * `/auth/github/callback` doesn't get matched as `provider = "github/callback"`.
 */
authRoutes.get("/:provider/callback", async (c) => {
  const provider = c.req.param("provider");
  if (!isProviderName(provider)) {
    return c.json({ error: "unknown_provider" }, 404);
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  const stateCookie = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });

  if (!code || !state || state !== stateCookie) {
    return c.redirect(`${env.webUrl}/?auth_error=invalid_state`, 302);
  }

  try {
    const cfg = getProvider(provider);

    const tokenRes = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error(`[oauth/${provider}] token exchange failed:`, text);
      return c.redirect(`${env.webUrl}/?auth_error=token_exchange_failed`, 302);
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenJson.access_token) {
      console.error(`[oauth/${provider}] no access_token:`, tokenJson);
      return c.redirect(`${env.webUrl}/?auth_error=no_token`, 302);
    }

    const profileRes = await fetch(cfg.userInfoUrl, {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        "User-Agent": "NoteKit",
        Accept: "application/json",
      },
    });
    if (!profileRes.ok) {
      console.error(`[oauth/${provider}] userinfo failed:`, await profileRes.text());
      return c.redirect(`${env.webUrl}/?auth_error=userinfo_failed`, 302);
    }
    const rawProfile = await profileRes.json();
    const profile = await cfg.parseProfile(rawProfile, tokenJson.access_token);

    const userId = await upsertUserFromOAuth(provider, profile, tokenJson.access_token);
    const session = await createSession(userId);
    setSessionCookie(c, session.id, session.expiresAt);

    return c.redirect(env.webUrl, 302);
  } catch (err) {
    console.error(`[oauth/${provider}] callback error:`, err);
    return c.redirect(`${env.webUrl}/?auth_error=server_error`, 302);
  }
});

/**
 * GET /auth/dev-vault — dev-only: seeds a fake GitHub token + vault config
 * so bootstrapCrypto() can reach the needs-setup phase without a real repo.
 */
authRoutes.get("/dev-vault", async (c) => {
  if (env.isProd) return c.json({ error: "not_available" }, 404);

  const { db, schema } = await import("../db");
  const { eq } = await import("drizzle-orm");

  const DEV_EMAIL = "dev@test.local";
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, DEV_EMAIL) });
  if (!user) return c.json({ error: "run /auth/dev-login first" }, 400);

  // Upsert a fake github oauth_account with a sentinel token.
  await db
    .insert(schema.oauthAccounts)
    .values({
      provider: "github",
      providerAccountId: "dev_gh_999",
      userId: user.id,
      accessToken: "dev_github_token",
    })
    .onConflictDoUpdate({
      target: [schema.oauthAccounts.provider, schema.oauthAccounts.providerAccountId],
      set: { accessToken: "dev_github_token" },
    });

  // Upsert a fake vault config.
  await db
    .insert(schema.userSettings)
    .values({
      userId: user.id,
      vaultProvider: "github",
      vaultOwner: "dev",
      vaultRepo: "notekit-vault",
      vaultBranch: "main",
    })
    .onConflictDoUpdate({
      target: [schema.userSettings.userId],
      set: { vaultOwner: "dev", vaultRepo: "notekit-vault", vaultBranch: "main" },
    });

  return c.redirect(env.webUrl, 302);
});

/**
 * GET /auth/dev-login — dev-only bypass: creates/reuses a test user and sets a real
 * session cookie, then redirects to the web app. Never available in production.
 */
authRoutes.get("/dev-login", async (c) => {
  if (env.isProd) return c.json({ error: "not_available" }, 404);

  const { db, schema } = await import("../db");
  const { nanoid } = await import("nanoid");
  const { eq } = await import("drizzle-orm");

  const DEV_EMAIL = "dev@test.local";
  let user = await db.query.users.findFirst({ where: eq(schema.users.email, DEV_EMAIL) });
  if (!user) {
    const id = nanoid(16);
    await db.insert(schema.users).values({
      id,
      email: DEV_EMAIL,
      name: "Dev User",
      avatarUrl: null,
      plan: "plus",
    });
    user = await db.query.users.findFirst({ where: eq(schema.users.email, DEV_EMAIL) });
  }

  const session = await createSession(user!.id);
  setSessionCookie(c, session.id, session.expiresAt);
  return c.redirect(env.webUrl, 302);
});

/**
 * GET /auth/:provider
 * Kick off OAuth: generate state, set state cookie, redirect to provider.
 *
 * This is the catch-all parameter route; keep it LAST so specific routes
 * above (/me, /providers, /signout, /:provider/callback) take precedence.
 */
authRoutes.get("/:provider", (c) => {
  const provider = c.req.param("provider");
  if (!isProviderName(provider)) {
    return c.json({ error: "unknown_provider" }, 404);
  }
  if (!providerConfigured(provider)) {
    return c.json({ error: "provider_not_configured", provider }, 503);
  }

  const cfg = getProvider(provider);
  const state = nanoid(24);
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "Lax",
    secure: env.isProd,
    path: "/",
    maxAge: 60 * 10,
  });

  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", cfg.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  if (provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }

  return c.redirect(url.toString(), 302);
});
