import { eq } from "drizzle-orm";
import type { DirectoryRepository } from "../../../application/ports/out/DirectoryRepository";
import { db, schema } from ".";

/** Drizzle/Postgres implementation of {@link DirectoryRepository}. */
export const directoryRepository: DirectoryRepository = {
  async publishKeys(userId, signingKey, devices) {
    const now = Date.now();
    await db
      .insert(schema.userSigningKeys)
      .values({ userId, signingKey, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.userSigningKeys.userId,
        set: { signingKey, updatedAt: now },
      });

    // Replace the published device set wholesale — simplest way to drop revoked
    // devices. (The set is small and bounded at 100.)
    await db
      .delete(schema.userDirectoryDevices)
      .where(eq(schema.userDirectoryDevices.userId, userId));
    if (devices.length > 0) {
      await db.insert(schema.userDirectoryDevices).values(
        devices.map((d) => ({
          userId,
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
  },

  async findUserIdByEmail(email) {
    const target = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    return target?.id ?? null;
  },

  async findSigningKey(userId) {
    const signing = await db.query.userSigningKeys.findFirst({
      where: eq(schema.userSigningKeys.userId, userId),
    });
    return signing?.signingKey ?? null;
  },

  async listDevices(userId) {
    const devices = await db.query.userDirectoryDevices.findMany({
      where: eq(schema.userDirectoryDevices.userId, userId),
    });
    return devices.map((d) => ({
      deviceId: d.deviceId,
      name: d.name,
      recipient: d.recipient,
      addedAt: d.addedAt,
      owner: d.owner,
      sig: d.sig,
    }));
  },
};
