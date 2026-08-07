/**
 * Centralized vault path sanitization.
 *
 * All user-supplied file paths that flow into Git operations must pass through
 * sanitizeVaultPath() before use. This prevents path traversal and accidental
 * writes to git internals or CI/CD configs. Access-control (which user can
 * reach which vault) is already enforced by requirePrincipal + resolveVault
 * in every route, so we don't need to re-block app-internal paths here.
 */

export class VaultPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultPathError";
  }
}

// Prefixes that identify valid user-content paths (includes .notekit/ for
// E2EE internals: keybox, device records, recovery, shares, etc.).
const ALLOWED_PREFIXES = [
  "notes/",
  "tickets/",
  "links/",
  "agents/",
  "chats/",
  ".notekit/",
] as const;

// Patterns that are never allowed, even under a valid prefix.
const BLOCKED_PATTERNS: RegExp[] = [
  /\.\./,          // path traversal
  /^\.git\//,      // raw git internals (not app data)
  /^\.github\//,   // CI/CD workflow files
];

/**
 * Normalize a raw path string:
 *   - collapse repeated slashes
 *   - resolve lone `.` segments
 *   - strip any leading slash so callers can pass "/notes/foo" safely
 */
function normalizePath(raw: string): string {
  // Strip leading slash
  let p = raw.startsWith("/") ? raw.slice(1) : raw;

  // Collapse double (or more) slashes
  p = p.replace(/\/+/g, "/");

  // Resolve lone `.` segments (e.g. "notes/./foo" → "notes/foo")
  p = p
    .split("/")
    .filter((seg) => seg !== ".")
    .join("/");

  return p;
}

/**
 * Validate and sanitize a user-supplied vault file path.
 *
 * @param path - raw path from request body / query string
 * @returns the sanitized path string
 * @throws VaultPathError with a clear message if the path is rejected
 */
export function sanitizeVaultPath(path: string): string {
  // 1. Reject empty / null-ish input
  if (!path || typeof path !== "string" || path.trim() === "") {
    throw new VaultPathError("path is required");
  }

  // 2. Normalize
  const normalized = normalizePath(path.trim());

  if (normalized === "") {
    throw new VaultPathError("path is required");
  }

  // 3. Check blocked patterns against the normalized path
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new VaultPathError(`path is not allowed: ${normalized}`);
    }
  }

  // 4. Require an allowed prefix
  const allowed = ALLOWED_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
  if (!allowed) {
    throw new VaultPathError(
      `path must start with one of: ${ALLOWED_PREFIXES.join(", ")} — got: ${normalized}`,
    );
  }

  return normalized;
}
