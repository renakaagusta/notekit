import type { NormalizedProfile, ProviderName } from "../../domain/oauth-provider";
import type { UserRepository } from "../ports/out/UserRepository";

/**
 * Link an OAuth sign-in to a NoteKit user and return the user id.
 *
 * If the provider account already exists, refresh its (encrypted) access token
 * and keep the same user. Otherwise link by email to an existing user, or create
 * a new "free" user, then insert the oauth_account row. Behaviour is identical
 * to the previous auth/upsert implementation; it now reads/writes through the
 * injected {@link UserRepository} and encrypts tokens through the injected
 * `encryptToken` dependency instead of importing Drizzle and the token adapter.
 */
export function createUpsertUserFromOAuth(
  repo: UserRepository,
  deps: { encryptToken(plain: string): string },
) {
  return async function upsertUserFromOAuth(
    provider: ProviderName,
    profile: NormalizedProfile,
    accessToken: string,
  ): Promise<string> {
    // 1. Try to find an existing oauth_account row.
    const existing = await repo.findOAuthAccount(provider, profile.providerAccountId);

    const encrypted = deps.encryptToken(accessToken);

    if (existing) {
      // Update tokens, keep user.
      await repo.updateOAuthAccessToken(provider, profile.providerAccountId, encrypted);
      return existing.userId;
    }

    // 2. No oauth_account yet. Try to link by email.
    const byEmail = await repo.findUserByEmail(profile.email);

    let userId: string;
    if (byEmail) {
      userId = byEmail.id;
    } else {
      userId = repo.newUserId();
      await repo.insertUser({
        id: userId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        plan: "free",
      });
    }

    await repo.insertOAuthAccount({
      provider,
      providerAccountId: profile.providerAccountId,
      userId,
      encryptedAccessToken: encrypted,
    });

    return userId;
  };
}
