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
import {
  lookupDirectoryByEmail,
  publishDirectoryKeys,
} from "../../../composition/directory";
import { getCurrentUser } from "../../../composition/sessions";
import { parseBody, z } from "../../../validation";

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

  await publishDirectoryKeys({
    userId: user.id,
    signingKey,
    devices: devices.map((d) => ({
      deviceId: d.deviceId,
      name: d.name ?? null,
      recipient: d.recipient,
      addedAt: d.addedAt,
      owner: d.owner ?? null,
      sig: d.sig ?? null,
    })),
  });

  return c.json({ ok: true });
});

directoryRoutes.get("/keys", async (c) => {
  const requester = await getCurrentUser(c);
  if (!requester) return c.json({ error: "unauthorized" }, 401);

  const email = c.req.query("email")?.trim().toLowerCase();
  if (!email) return c.json({ error: "email_required" }, 400);

  const result = await lookupDirectoryByEmail(email);
  if (!result) return c.json({ error: "not_found" }, 404);

  return c.json({
    email,
    signingKey: result.signingKey,
    devices: result.devices.map((d) => ({
      deviceId: d.deviceId,
      name: d.name,
      recipient: d.recipient,
      addedAt: d.addedAt,
      owner: d.owner,
      sig: d.sig,
    })),
  });
});
