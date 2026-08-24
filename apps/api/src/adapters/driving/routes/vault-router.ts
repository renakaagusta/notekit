/**
 * Shared vaultRoutes instance. Imported by vault.ts, vault-members.ts,
 * and vault-providers.ts so all route registrations target the same Hono app.
 */
import { Hono } from "hono";

export const vaultRoutes = new Hono();
