/**
 * Request validation primitives. One schema per shape; routes apply via
 * `parseBody`/`parseQuery`. Trust ends at the parser — downstream code
 * can rely on the inferred type.
 */
import type { Context } from "hono";
import { z } from "zod";

export { z };

// ─── Reusable primitives ────────────────────────────────────────────────

/**
 * Folder path stored inside a vault. Allowed: `a/b/c` style relative paths
 * with letters, digits, `-`, `_`, `.` (single dot only) per segment.
 * Rejected: empty, leading/trailing slashes, `..`, control chars, > 120 chars,
 * Windows drive letters, NUL.
 */
export const FolderPath = z
  .string()
  .max(120, "folder_too_long")
  .refine((s) => !s.includes("\0"), "folder_contains_nul")
  .refine((s) => !/[\u0000-\u001f]/.test(s), "folder_contains_control")
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, "folder_empty")
  .refine((s) => !s.startsWith("/"), "folder_absolute")
  .transform((s) => s.split("/").map((p) => p.trim()).filter(Boolean).join("/"))
  .refine((s) => s.length > 0, "folder_empty_after_normalize")
  .refine(
    (s) => s.split("/").every((seg) => seg !== ".." && seg !== "."),
    "folder_traversal",
  )
  .refine(
    (s) => s.split("/").every((seg) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(seg)),
    "folder_invalid_segment",
  );

/**
 * Optional folder. `null` and `""` both normalize to `null`.
 */
export const FolderPathNullable = z
  .union([FolderPath, z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : v));

/** Agent slug as produced by `slugifyAgentName`. */
export const AgentSlug = z
  .string()
  .min(1, "slug_empty")
  .max(60, "slug_too_long")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug_invalid_shape");

export const AgentSlugNullable = z
  .union([AgentSlug, z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : v));

/**
 * Git branch ref name. Subset of git's rules — letters, digits, `-`, `_`,
 * `.`, `/`. No leading/trailing `/`, no consecutive dots, no spaces, no
 * control chars. Keeps URL-encoding safe and human-readable.
 */
export const BranchName = z
  .string()
  .min(1, "branch_empty")
  .max(120, "branch_too_long")
  .regex(/^(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._\-/]+(?<!\/)$/, "branch_invalid");

/** Owner / repo segments per GitHub's rules (loose superset). */
export const RepoName = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, "repo_invalid");

export const OwnerName = z
  .string()
  .min(1)
  .max(39)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "owner_invalid");

export const ThemeEnum = z.enum(["auto", "light", "dark"]);

export const VaultProviderEnum = z.enum(["github", "notekit"]);

/** Free-form label cap. */
export const Label = z
  .string()
  .max(80, "label_too_long")
  .transform((s) => s.trim())
  .refine((s) => !/[\u0000-\u001f]/.test(s), "label_contains_control");

export const LabelNullable = z
  .union([Label, z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : v));

// ─── Hono helpers ───────────────────────────────────────────────────────

/**
 * Parse a JSON body against a zod schema. On failure, the route should
 * return `c.json({ error, issues }, 400)`. We don't throw a Hono error
 * because returning the issue list is friendlier than a 500.
 */
export async function parseBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; status: 400; body: unknown }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return {
      ok: false,
      status: 400,
      body: { error: "invalid_json" },
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_body",
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    };
  }
  return { ok: true, data: result.data };
}
