/**
 * Public-key directory for cross-user E2EE sharing.
 *
 * To encrypt a note *to* another NoteKit user we need their device public
 * keys — but those live in their own git vault, which we can't read. So each
 * user publishes their PUBLIC keys here (their recovery signing key + device
 * recipients) and others look them up by email.
 *
 * Zero-knowledge is preserved: this stores public keys only, never private
 * keys or content. The server does NOT verify the signatures — it can't (it
 * holds no recovery key). The *consuming client* verifies each device record's
 * `sig` against the published `signingKey`, and verifies the signing key itself
 * out-of-band via a safety number. See docs/architecture/
 * e2ee-everywhere-and-sharing.md §3.
 *
 * Endpoints:
 *   - PUT /directory/keys            publish the caller's public keys
 *   - GET /directory/keys?email=…    look up a user's public keys
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getCurrentUser } from "../auth/sessions";
import { parseBody, z } from "../validation";

export const directoryRoutes = new Hono();

const PublishBody = z.object({
  signingKey: z.string().min(1).max(256),
  devices: z
    .array(
      z.object({
        deviceId: z.string().min(1).max(128),
        name: z.string().max(128).optional(),
        recipient: z.string().min(1).max(256),
        addedAt: z.string().min(1).max(64),
        owner: z.string().max(256).optional(),
        sig: z.string().max(256).optional(),
      }),
    )
    .max(100),
});

directoryRoutes.put("/keys", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseBody(c, PublishBody);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const { signingKey, devices } = parsed.data;

  const now = new Date();
  await db
    .insert(schema.userSigningKeys)
    .values({ userId: user.id, signingKey, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.userSigningKeys.userId,
      set: { signingKey, updatedAt: now },
    });

  // Replace the published device set wholesale — simplest way to drop revoked
  // devices. (The set is small and bounded at 100.)
  await db
    .delete(schema.userDirectoryDevices)
    .where(eq(schema.userDirectoryDevices.userId, user.id));
  if (devices.length > 0) {
    await db.insert(schema.userDirectoryDevices).values(
      devices.map((d) => ({
        userId: user.id,
        deviceId: d.deviceId,
        name: d.name ?? null,
        recipient: d.recipient,
        addedAt: d.addedAt,
        owner: d.owner ?? null,
        sig: d.sig ?? null,
        updatedAt: now,
      })),
    );
  }

  return c.json({ ok: true });
});

directoryRoutes.get("/keys", async (c) => {
  const requester = await getCurrentUser(c);
  if (!requester) return c.json({ error: "unauthorized" }, 401);

  const email = c.req.query("email")?.trim().toLowerCase();
  if (!email) return c.json({ error: "email_required" }, 400);

  const target = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });
  // Don't distinguish "no such user" from "published nothing" — both are a
  // plain 404 so the directory can't be used to enumerate who has an account.
  if (!target) return c.json({ error: "not_found" }, 404);

  const signing = await db.query.userSigningKeys.findFirst({
    where: eq(schema.userSigningKeys.userId, target.id),
  });
  if (!signing) return c.json({ error: "not_found" }, 404);

  const devices = await db.query.userDirectoryDevices.findMany({
    where: eq(schema.userDirectoryDevices.userId, target.id),
  });

  return c.json({
    email,
    signingKey: signing.signingKey,
    devices: devices.map((d) => ({
      deviceId: d.deviceId,
      name: d.name,
      recipient: d.recipient,
      addedAt: d.addedAt,
      owner: d.owner,
      sig: d.sig,
    })),
  });
});
