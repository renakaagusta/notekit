import { and, desc, eq, isNull } from "drizzle-orm";
import type {
  AuthRepository,
  AuthUserRow,
  PersonalAccessTokenListRow,
} from "../../../application/ports/out/AuthRepository";
import { db, schema } from ".";

/**
 * Drizzle/Postgres implementation of {@link AuthRepository}. Every query below
 * is a verbatim relocation of the code that previously lived inline in the auth
 * route — same tables, columns, conflict targets, and ordering.
 */
export const authRepository: AuthRepository = {
  async insertPersonalAccessToken(input): Promise<void> {
    await db.insert(schema.personalAccessTokens).values({
      id: input.id,
      userId: input.userId,
      name: input.name,
      tokenHash: input.tokenHash,
      scope: input.scope,
      ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
    });
  },

  async listPersonalAccessTokens(userId: string): Promise<PersonalAccessTokenListRow[]> {
    return db
      .select({
        id: schema.personalAccessTokens.id,
        name: schema.personalAccessTokens.name,
        scope: schema.personalAccessTokens.scope,
        createdAt: schema.personalAccessTokens.createdAt,
        lastUsedAt: schema.personalAccessTokens.lastUsedAt,
      })
      .from(schema.personalAccessTokens)
      .where(
        and(
          eq(schema.personalAccessTokens.userId, userId),
          isNull(schema.personalAccessTokens.revokedAt),
        ),
      )
      .orderBy(desc(schema.personalAccessTokens.createdAt));
  },

  async revokePersonalAccessToken(
    id: string,
    userId: string,
    revokedAtMs: number,
  ): Promise<{ id: string }[]> {
    return db
      .update(schema.personalAccessTokens)
      .set({ revokedAt: revokedAtMs })
      .where(
        and(
          eq(schema.personalAccessTokens.id, id),
          eq(schema.personalAccessTokens.userId, userId),
          isNull(schema.personalAccessTokens.revokedAt),
        ),
      )
      .returning({ id: schema.personalAccessTokens.id });
  },

  async upsertGithubAppInstallation(input): Promise<void> {
    const setClause: {
      installationId: number;
      userToken?: string | null;
      refreshToken?: string | null;
    } = { installationId: input.installationId };
    if (input.userToken) {
      setClause.userToken = input.userToken;
      setClause.refreshToken = input.refreshToken;
    }
    await db
      .insert(schema.githubAppInstallations)
      .values({
        userId: input.userId,
        installationId: input.installationId,
        userToken: input.userToken,
        refreshToken: input.refreshToken,
      })
      .onConflictDoUpdate({
        target: schema.githubAppInstallations.userId,
        set: setClause,
      });
  },

  async findUserByEmail(email: string): Promise<AuthUserRow | null> {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    return user ? { id: user.id, email: user.email } : null;
  },

  async insertDevUser(input): Promise<void> {
    await db.insert(schema.users).values({
      id: input.id,
      email: input.email,
      name: input.name,
      avatarUrl: input.avatarUrl,
      plan: input.plan,
    });
  },

  async upsertDevForgejoAccount(input): Promise<void> {
    await db
      .insert(schema.forgejoAccounts)
      .values({
        userId: input.userId,
        username: input.username,
        accessToken: input.accessToken,
      })
      .onConflictDoUpdate({
        target: [schema.forgejoAccounts.userId],
        set: { accessToken: input.accessToken, username: input.username },
      });
  },

  async findNotekitDevVault(userId: string): Promise<{ id: string } | null> {
    const existing = await db.query.vaults.findFirst({
      where: and(
        eq(schema.vaults.userId, userId),
        eq(schema.vaults.provider, "notekit"),
        eq(schema.vaults.owner, "dev-notekit"),
        eq(schema.vaults.repo, "notekit"),
      ),
    });
    return existing ? { id: existing.id } : null;
  },

  async insertDevVault(input): Promise<void> {
    await db.insert(schema.vaults).values({
      id: input.id,
      userId: input.userId,
      provider: input.provider,
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      label: input.label,
    });
  },

  async setActiveVaultSetting(userId: string, activeVaultId: string): Promise<void> {
    await db
      .insert(schema.userSettings)
      .values({ userId, activeVaultId })
      .onConflictDoUpdate({
        target: [schema.userSettings.userId],
        set: { activeVaultId },
      });
  },

  async upsertDevGithubOAuthAccount(input): Promise<void> {
    await db
      .insert(schema.oauthAccounts)
      .values({
        provider: input.provider,
        providerAccountId: input.providerAccountId,
        userId: input.userId,
        accessToken: input.accessToken,
      })
      .onConflictDoUpdate({
        target: [schema.oauthAccounts.provider, schema.oauthAccounts.providerAccountId],
        set: { accessToken: input.accessToken },
      });
  },

  async upsertDevVaultConfigSetting(input): Promise<void> {
    await db
      .insert(schema.userSettings)
      .values({
        userId: input.userId,
        vaultProvider: input.vaultProvider,
        vaultOwner: input.vaultOwner,
        vaultRepo: input.vaultRepo,
        vaultBranch: input.vaultBranch,
      })
      .onConflictDoUpdate({
        target: [schema.userSettings.userId],
        set: {
          vaultOwner: input.vaultOwner,
          vaultRepo: input.vaultRepo,
          vaultBranch: input.vaultBranch,
        },
      });
  },
};
