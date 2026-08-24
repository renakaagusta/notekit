import { eq } from "drizzle-orm";
import type {
  GithubAppInstallationRepository,
  GithubAppInstallationRow,
} from "../../../application/ports/out/GithubAppInstallationRepository";
import { db, schema } from ".";

/** Drizzle/Postgres implementation of {@link GithubAppInstallationRepository}. */
export const githubAppInstallationRepository: GithubAppInstallationRepository = {
  async findByUser(userId: string): Promise<GithubAppInstallationRow | null> {
    const row = await db.query.githubAppInstallations.findFirst({
      where: eq(schema.githubAppInstallations.userId, userId),
    });
    if (!row) return null;
    return {
      installationId: row.installationId,
      accountLogin: row.accountLogin,
      userToken: row.userToken,
    };
  },
};
