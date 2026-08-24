/**
 * Composition root for session auth: binds the session functions to the
 * Drizzle repository, then re-exports them. Importers pull the session
 * functions from here so the port is wired before first use.
 */
import { sessionRepository } from "../adapters/driven/auth/sessionRepository";
import { configureSessions } from "../adapters/driving/auth/sessions";

// `getCurrentUser` (in auth/sessions) calls `getPatPrincipal`. Importing the
// PAT composition root here guarantees the PAT port is bound before any session
// code can run, regardless of import order at the call sites.
import "./personalTokens";

configureSessions(sessionRepository);

export * from "../adapters/driving/auth/sessions";
