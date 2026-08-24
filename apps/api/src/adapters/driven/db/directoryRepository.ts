import { eq } from "drizzle-orm";
import type {
  DirectoryLookup,
  DirectoryPublishInput,
  DirectoryRepository,
} from "../../../application/ports/out/DirectoryRepository";
import { db, schema } from ".";

/** Drizzle/Postgres implementation of {@link DirectoryRepository}. */
export const directoryRepository: DirectoryRepository = {
  async publishKeys({ userId, signingKey, devices }: DirectoryPublishInput) {
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
          name: d.name,
          recipient: d.recipient,
          addedAt: d.addedAt,
          owner: d.owner,
          sig: d.sig,
          updatedAt: now,
        })),
      );
    }
  },

  async lookupByEmail(email: string): Promise<DirectoryLookup | null> {
    const target = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    // Don't distinguish "no such user" from "published nothing" — both are a
    // plain 404 so the directory can't be used to enumerate who has an account.
    if (!target) return null;

    const signing = await db.query.userSigningKeys.findFirst({
      where: eq(schema.userSigningKeys.userId, target.id),
    });
    if (!signing) return null;

    const devices = await db.query.userDirectoryDevices.findMany({
      where: eq(schema.userDirectoryDevices.userId, target.id),
    });

    return {
      signingKey: signing.signingKey,
      devices: devices.map((d) => ({
        deviceId: d.deviceId,
        name: d.name,
        recipient: d.recipient,
        addedAt: d.addedAt,
        owner: d.owner,
        sig: d.sig,
      })),
    };
  },
};
