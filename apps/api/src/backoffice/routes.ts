import { Hono } from "hono";
import type { Context } from "hono";
import { pool } from "../adapters/driven/db";
import { isBackofficeAdmin } from "../env";
import { backofficeAuth } from "./auth";

export const backofficeRoutes = new Hono();

// --- better-auth handler: /backoffice/auth/* -------------------------------
backofficeRoutes.on(["POST", "GET"], "/auth/*", (c) =>
  backofficeAuth.handler(c.req.raw),
);

// --- admin gate -------------------------------------------------------------
// Resolves the better-auth session and requires an allowlisted admin email.
async function requireAdmin(
  c: Context,
): Promise<{ id: string; email: string; name?: string; image?: string | null } | null> {
  const session = await backofficeAuth.api.getSession({ headers: c.req.raw.headers });
  const user = session?.user;
  if (!user || !isBackofficeAdmin(user.email)) return null;
  return { id: user.id, email: user.email, name: user.name ?? undefined, image: user.image };
}

function isoDay(ms: number | null): string {
  if (!ms) return "";
  return new Date(Number(ms)).toISOString().slice(0, 10);
}

// --- who am I ---------------------------------------------------------------
backofficeRoutes.get("/me", async (c) => {
  const admin = await requireAdmin(c);
  if (!admin) return c.json({ error: "forbidden" }, 403);
  return c.json({ ...admin, isSuperAdmin: true });
});

// --- dashboard overview -----------------------------------------------------
backofficeRoutes.get("/overview", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);

  const [{ rows: totals }, { rows: signups }] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS "totalUsers",
        (SELECT COUNT(*)::int FROM vaults) AS "activeVaults",
        (SELECT COUNT(*)::int FROM users WHERE plan IN ('plus','lifetime')) AS "plusSubscribers",
        (SELECT COUNT(*)::int FROM agent_tokens WHERE revoked_at IS NULL) AS "agents"
    `),
    pool.query(`
      SELECT id, COALESCE(name, '—') AS name, email, plan, created_at
      FROM users ORDER BY created_at DESC LIMIT 10
    `),
  ]);

  return c.json({
    ...totals[0],
    recentSignups: signups.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      plan: r.plan,
      joinedAt: isoDay(r.created_at),
    })),
  });
});

// --- users ------------------------------------------------------------------
backofficeRoutes.get("/users", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);

  const { rows } = await pool.query(`
    SELECT
      u.id,
      COALESCE(u.name, '—') AS name,
      u.email,
      u.plan,
      COALESCE((SELECT oa.provider FROM oauth_accounts oa WHERE oa.user_id = u.id LIMIT 1), 'email') AS provider,
      u.created_at
    FROM users u
    ORDER BY u.created_at DESC
    LIMIT 200
  `);

  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      plan: r.plan === "free" ? "free" : "plus",
      provider: r.provider,
      createdAt: isoDay(r.created_at),
    })),
  );
});

// --- billing ----------------------------------------------------------------
backofficeRoutes.get("/billing", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);

  const { rows } = await pool.query(`
    SELECT plus_source, COUNT(*)::int AS n
    FROM users WHERE plan IN ('plus','lifetime') GROUP BY plus_source
  `);
  const bySource: Record<string, number> = {};
  let plusCount = 0;
  for (const r of rows) {
    bySource[r.plus_source ?? "unknown"] = r.n;
    plusCount += r.n;
  }

  const { rows: subs } = await pool.query(`
    SELECT id, email, plus_source, plan, created_at
    FROM users WHERE plan IN ('plus','lifetime')
    ORDER BY created_at DESC LIMIT 200
  `);

  return c.json({
    // Rough monthly figure at the $1.49 Plus price — we don't store term yet.
    mrr: Math.round(plusCount * 1.49),
    apple: bySource["apple"] ?? 0,
    play: bySource["google"] ?? 0,
    stripe: bySource["stripe"] ?? 0,
    subscribers: subs.map((r) => ({
      id: r.id,
      email: r.email,
      processor: r.plus_source === "google" ? "play" : (r.plus_source ?? "stripe"),
      term: r.plan === "lifetime" ? "lifetime" : "monthly",
      since: isoDay(r.created_at),
    })),
  });
});

// --- vaults & agents --------------------------------------------------------
backofficeRoutes.get("/vaults", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "forbidden" }, 403);

  const [{ rows: totals }, { rows: vaults }] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM vaults) AS "totalVaults",
        (SELECT COUNT(*)::int FROM agent_tokens WHERE revoked_at IS NULL) AS "totalAgents"
    `),
    pool.query(`
      SELECT
        v.id,
        u.email AS owner,
        v.provider AS backend,
        (SELECT COUNT(*)::int FROM agent_tokens at WHERE at.user_id = v.user_id AND at.revoked_at IS NULL) AS agents
      FROM vaults v
      JOIN users u ON u.id = v.user_id
      ORDER BY v.created_at DESC
      LIMIT 200
    `),
  ]);

  return c.json({
    ...totals[0],
    vaults: vaults.map((r) => ({
      id: r.id,
      owner: r.owner,
      backend: r.backend,
      encrypted: false,
      quotaUsedMb: 0,
      agents: r.agents,
    })),
  });
});
