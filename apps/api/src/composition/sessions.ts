/**
 * Composition root for session auth: binds the session functions to the
 * Drizzle repository, then re-exports them. Importers pull the session
 * functions from here so the port is wired before first use.
 */
import { sessionRepository } from "../adapters/driven/auth/sessionRepository";
import { configureSessions } from "../auth/sessions";

configureSessions(sessionRepository);

export * from "../auth/sessions";
