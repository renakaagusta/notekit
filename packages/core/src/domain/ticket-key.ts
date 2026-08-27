/**
 * Human-friendly ticket keys. The key is a slug shown in place of the opaque
 * nanoid id; it is renameable and only needs to be unique per vault. The nanoid
 * remains the immutable file identity — this never replaces it.
 */
import { slugify } from "./file-paths";

/**
 * Derive a unique key from a title (or a user-supplied `desired` slug). Slugs
 * the source; if that base is already taken (case-insensitive) among
 * `existingKeys`, appends `-2`, `-3`, … until free. `existingKeys` should
 * EXCLUDE the ticket being keyed (so re-deriving its own key is stable).
 */
export function deriveTicketKey(
  title: string,
  existingKeys: Iterable<string>,
  desired?: string,
): string {
  const taken = new Set<string>();
  for (const k of existingKeys) taken.add(k.toLowerCase());
  const source = desired && desired.trim() ? desired : title;
  const base = slugify(source) || "task";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
