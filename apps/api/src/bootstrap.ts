/**
 * API bootstrap entrypoint.
 *
 * Runs BEFORE index.ts so that HashiCorp Vault secrets land in process.env
 * before env.ts evaluates and validates them. Static imports in index.ts
 * (including env.ts) are hoisted and would run at module-load time — the only
 * way to guarantee pre-population is a dynamic import from a parent module.
 *
 * Start order:
 *   1. bootstrap.ts  — load Vault secrets into process.env
 *   2. index.ts      — static imports (telemetry → env → routes) evaluate now
 *   3. serve()       — HTTP server starts
 */
import { loadVaultSecrets, vaultConfigured } from './lib/hcvault.js';

if (vaultConfigured()) {
  await loadVaultSecrets();
}

await import('./index.js');
