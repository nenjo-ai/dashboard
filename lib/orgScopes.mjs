/**
 * Org scope helpers shared by the org context and unit tests.
 *
 * Backend endpoints return effective scopes. An empty array is authoritative:
 * it represents an intentional custom assignment with no granted scopes.
 */

/**
 * @param {string[]} scopes
 * @param {string} required
 * @returns {boolean}
 */
export function hasOrgScope(scopes, required) {
  if (!Array.isArray(scopes) || !required) return false;
  if (scopes.includes(required)) return true;
  if (!required.endsWith(":read")) return false;
  return scopes.includes(required.replace(":read", ":write"));
}

/**
 * Pick the first scopes list supplied by an authoritative source. Empty arrays
 * are valid and must not fall through to older cached grants.
 *
 * @param {...(string[] | null | undefined)} candidates
 * @returns {string[]}
 */
export function firstDefinedScopes(...candidates) {
  for (const scopes of candidates) {
    if (Array.isArray(scopes)) {
      return scopes;
    }
  }
  return [];
}
