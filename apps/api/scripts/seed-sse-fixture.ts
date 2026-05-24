/**
 * Seed a minimal fixture for end-to-end SSE testing. Creates:
 *   - a user
 *   - a GitHub OAuth row with `dev_github_token` (the in-process stub)
 *   - a vault registered to `dev/devrepo@main`, set active
 *   - a PAT for cli scope
 *
 * Prints the PAT plaintext on success — pipe it into the curl recipe
 * (apps/api/scripts/smoke-sse.sh) to exercise the live HTTP path.
 *
 * Idempotent on a per-email basis: re-running upserts the user and
 * re-issues a fresh PAT.
 */
import { nanoid } from "nanoid";
import { db, schema } from "../src/db/index.js";
import { encryptToken } from "../src/auth/tokenCrypto.js";
import {
  generatePersonalAccessToken,
  newPatId,
} from "../src/auth/personalTokens.js";
import { createVault, setActiveVault } from "../src/vault/store.js";
import { eq, and } from "drizzle-orm";

const EMAIL = "sse-smoke@example.com";
const NAME = "SSE Smoke";

async function main() {
  // 1. Upsert user
  let user = await db.query.users.findFirst({
    where: eq(schema.users.email, EMAIL),
  });
  if (!user) {
    const id = `usr_${nanoid(16)}`;
    db.insert(schema.users)
      .values({ id, email: EMAIL, name: NAME, createdAt: new Date() })
      .run();
    user = await db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
  }
  if (!user) throw new Error("failed to create user");
  console.log(`user: ${user.id} (${user.email})`);

  // 2. Stub GitHub OAuth row so getGithubToken() returns "dev_github_token"
  const existingOauth = await db.query.oauthAccounts.findFirst({
    where: and(
      eq(schema.oauthAccounts.provider, "github"),
      eq(schema.oauthAccounts.userId, user.id),
    ),
  });
  const encrypted = encryptToken("dev_github_token");
  if (existingOauth) {
    db.update(schema.oauthAccounts)
      .set({ accessToken: encrypted })
      .where(
        and(
          eq(schema.oauthAccounts.provider, "github"),
          eq(schema.oauthAccounts.userId, user.id),
        ),
      )
      .run();
  } else {
    db.insert(schema.oauthAccounts)
      .values({
        provider: "github",
        providerAccountId: `dev-${user.id}`,
        userId: user.id,
        accessToken: encrypted,
        createdAt: new Date(),
      })
      .run();
  }
  console.log("oauth: github stub stored");

  // 3. Vault row + activate
  const vault = await createVault({
    userId: user.id,
    provider: "github",
    owner: "dev",
    repo: "devrepo",
    branch: "main",
    label: "dev/devrepo",
  });
  await setActiveVault(user.id, vault.id);
  console.log(`vault: ${vault.id} (${vault.owner}/${vault.repo}@${vault.branch})`);

  // 4. Mint PAT
  const { plain, hash } = generatePersonalAccessToken();
  const id = newPatId();
  db.insert(schema.personalAccessTokens)
    .values({
      id,
      userId: user.id,
      name: "sse-smoke",
      tokenHash: hash,
      scope: "cli",
      createdAt: new Date(),
    })
    .run();
  console.log(`pat:   ${plain}`);
  console.log(`\nExport for the smoke shell:\n  export NOTEKIT_PAT='${plain}'`);
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
