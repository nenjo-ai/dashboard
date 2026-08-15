/** Maximum routine slug length accepted by the platform. */
export const ROUTINE_SLUG_MAX_LENGTH = 255;

/**
 * Derive a valid routine slug from a user-facing name.
 *
 * This mirrors `nenjo::Slug::derive`: ASCII letters and digits are lowercased,
 * underscores and hyphens are preserved, whitespace becomes a hyphen, other
 * characters are discarded, and adjacent separators are collapsed.
 */
export function deriveRoutineSlug(name: string): string {
  let slug = "";
  let previousWasSeparator = false;

  for (const character of name) {
    let next: string | undefined;
    if (/^[A-Za-z0-9]$/.test(character)) {
      next = character.toLowerCase();
    } else if (character === "_" || character === "-") {
      next = character;
    } else if (/^\s$/.test(character)) {
      next = "-";
    }

    if (next === undefined) continue;

    const isSeparator = next === "_" || next === "-";
    if (isSeparator && (previousWasSeparator || slug.length === 0)) continue;

    slug += next;
    previousWasSeparator = isSeparator;
    if (slug.length === ROUTINE_SLUG_MAX_LENGTH) break;
  }

  slug = slug.replace(/[_-]+$/, "");
  return slug || "slug";
}

/**
 * Return a creation request with a non-empty stable slug.
 *
 * Callers may provide an explicit slug; otherwise the routine name supplies it.
 * This is intentionally a creation-only operation because renaming a routine
 * must not silently change its stable identity.
 */
export function withRoutineCreationSlug<T extends { name: string; slug?: string }>(
  routine: T,
): T & { slug: string } {
  return {
    ...routine,
    slug: routine.slug?.trim() || deriveRoutineSlug(routine.name),
  };
}
