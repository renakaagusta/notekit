/**
 * HashiCorp Vault integration — AppRole auth + KV v2 + background token renewal.
 *
 * Activated when VAULT_ADDR + VAULT_ROLE_ID + VAULT_SECRET_ID are all set.
 * When any is absent the module is a no-op: env.ts falls through to process.env
 * directly so local dev keeps working without a Vault instance.
 *
 * KV config:
 *   VAULT_KV_MOUNT  — KV v2 mount (default: "kv")
 *   VAULT_KV_PATH   — secret path within the mount (default: "notekit/production")
 *
 * Call loadVaultSecrets() once at startup (before env.ts is evaluated) to
 * merge all KV keys into process.env. The module then keeps the token alive
 * in the background via the renewal loop.
 */

const VAULT_ADDR = process.env['VAULT_ADDR'];
const VAULT_ROLE_ID = process.env['VAULT_ROLE_ID'];
const VAULT_SECRET_ID = process.env['VAULT_SECRET_ID'];
const VAULT_KV_MOUNT = process.env['VAULT_KV_MOUNT'] ?? 'secret';
const VAULT_KV_PATH = process.env['VAULT_KV_PATH'] ?? 'notekit';

interface AppRoleAuthResult {
  auth: { client_token: string; lease_duration: number; renewable: boolean };
}

interface KvV2ReadResult {
  data: { data: Record<string, string> };
}

let _token: string | null = null;
let _renewalTimer: ReturnType<typeof setTimeout> | null = null;

export function vaultConfigured(): boolean {
  return !!(VAULT_ADDR && VAULT_ROLE_ID && VAULT_SECRET_ID);
}

async function vaultRequest(path: string, opts: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${VAULT_ADDR}/v1/${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> | undefined ?? {}),
      ...(_token ? { 'X-Vault-Token': _token } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Vault ${opts.method ?? 'GET'} /${path} → HTTP ${res.status}: ${body}`);
  }
  return res;
}

async function login(): Promise<{ token: string; ttl: number }> {
  const res = await vaultRequest('auth/approle/login', {
    method: 'POST',
    body: JSON.stringify({ role_id: VAULT_ROLE_ID, secret_id: VAULT_SECRET_ID }),
  });
  const json = await res.json() as AppRoleAuthResult;
  return { token: json.auth.client_token, ttl: json.auth.lease_duration };
}

async function renew(): Promise<number> {
  const res = await vaultRequest('auth/token/renew-self', { method: 'POST' });
  const json = await res.json() as AppRoleAuthResult;
  return json.auth.lease_duration;
}

function scheduleRenewal(ttlSeconds: number): void {
  if (_renewalTimer !== null) clearTimeout(_renewalTimer);
  // Renew at 80% of TTL — generous margin before expiry without hammering Vault.
  const delayMs = Math.max(ttlSeconds * 0.8 * 1000, 30_000);
  _renewalTimer = setTimeout(() => {
    void (async () => {
      try {
        const newTtl = await renew();
        scheduleRenewal(newTtl);
      } catch {
        // Renewal failed — fall back to a full re-login.
        try {
          const { token, ttl } = await login();
          _token = token;
          scheduleRenewal(ttl);
        } catch {
          // Re-login also failed; subsequent Vault calls will error loudly.
        }
      }
    })();
  }, delayMs);
}

/**
 * Fetch all secrets from the configured KV v2 path and merge them into
 * process.env. Must be called BEFORE env.ts is evaluated — env.ts validates
 * secrets at module init time and throws on missing values.
 *
 * Returns the fetched secret map (empty when Vault is not configured).
 * Throws on any Vault error when Vault IS configured — the API should not
 * start with incomplete secrets.
 */
export async function loadVaultSecrets(): Promise<Record<string, string>> {
  if (!vaultConfigured()) return {};

  const { token, ttl } = await login();
  _token = token;
  scheduleRenewal(ttl);

  const res = await vaultRequest(`${VAULT_KV_MOUNT}/data/${VAULT_KV_PATH}`);
  const kv = await res.json() as KvV2ReadResult;
  const secrets = kv.data.data;

  for (const [key, value] of Object.entries(secrets)) {
    process.env[key] = value;
  }

  return secrets;
}

/**
 * Explicitly revoke the current Vault token. Call on graceful shutdown so the
 * short-lived token doesn't linger until its natural TTL expiry.
 */
export async function revokeVaultToken(): Promise<void> {
  if (!_token) return;
  if (_renewalTimer !== null) clearTimeout(_renewalTimer);
  _renewalTimer = null;
  try {
    await vaultRequest('auth/token/revoke-self', { method: 'POST' });
  } finally {
    _token = null;
  }
}
