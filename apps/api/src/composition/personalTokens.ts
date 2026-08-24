/**
 * Composition root for personal-access-token auth: binds the PAT functions to
 * the Drizzle repository, then re-exports them. Importers pull the PAT
 * functions from here so the port is wired before first use.
 *
 * `composition/sessions` imports this module so that `getCurrentUser` (which
 * calls `getPatPrincipal`) can never run before the PAT port is bound.
 */
import { personalTokenRepository } from "../adapters/driven/auth/personalTokenRepository";
import { configurePersonalTokens } from "../adapters/driving/auth/personalTokens";

configurePersonalTokens(personalTokenRepository);

export * from "../adapters/driving/auth/personalTokens";
