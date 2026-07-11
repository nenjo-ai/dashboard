/**
 * Org scope helpers shared by the org context and unit tests.
 *
 * Backend contract (services::org_authz::resolve_user_org_context_for_org):
 * an empty scopes array on org_members means "use role default scopes".
 * Auth-resolved endpoints (/auth/me, /orgs/current) apply that fallback;
 * GET /orgs currently returns raw DB scopes and may therefore be [].
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
 * Pick the first non-empty scopes list. Empty arrays are treated as missing
 * so they do not shadow auth-resolved scopes (which apply role defaults).
 *
 * @param {...(string[] | null | undefined)} candidates
 * @returns {string[]}
 */
export function firstNonEmptyScopes(...candidates) {
  for (const scopes of candidates) {
    if (Array.isArray(scopes) && scopes.length > 0) {
      return scopes;
    }
  }
  return [];
}
