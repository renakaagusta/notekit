import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { pool } from "../adapters/driven/db";
import { env, isBackofficeAdmin } from "../env";
import { logger } from "../lib/logger";

/**
 * better-auth instance powering the superadmin backoffice (apps/backoffice).
 *
 * It is completely separate from the app's own OAuth (routes/auth.ts): it has
 * its own tables (bo_*), its own base path (/backoffice/auth), and its own
 * cookie. Only allowlisted admin emails (BACKOFFICE_ADMIN_EMAILS) may complete
 * a sign-in — see the `signIn.before` hook below.
 *
 * There is no email transport wired into the API yet, so magic links are
 * written to the server log. Google OAuth is the primary, fully-working path.
 */
export const backofficeAuth = betterAuth({
  baseURL: env.apiUrl,
  basePath: "/backoffice/auth",
  secret: env.sessionSecret,
  database: pool,
  trustedOrigins: [env.backoffice.webUrl],

  // Map better-auth's default models onto the prefixed bo_* tables.
  user: { modelName: "bo_user" },
  session: { modelName: "bo_session" },
  account: { modelName: "bo_account" },
  verification: { modelName: "bo_verification" },

  socialProviders:
    env.google.clientId && env.google.clientSecret
      ? {
          google: {
            clientId: env.google.clientId,
            clientSecret: env.google.clientSecret,
          },
        }
      : undefined,

  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // No email transport yet — log the link so an admin can complete
        // sign-in during setup. Replace with a real email send when wired.
        logger.info({ email, url }, "[backoffice] magic link");
      },
    }),
  ],

  // Gate: reject any sign-in from a non-allowlisted email before a user or
  // session row is created.
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!isBackofficeAdmin(user.email)) {
            throw new Error("This account does not have backoffice access.");
          }
          return { data: user };
        },
      },
    },
  },
});
