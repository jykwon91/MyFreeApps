/**
 * A saved search's config as a short line: the board token for Greenhouse, the company slug for
 * Lever, and the roles (or a legacy raw query) for JSearch.
 */
export function summarizeSearchQuery(config: Record<string, unknown>, source?: string): string {
  if (source === "greenhouse") {
    const token = config.board_token;
    return typeof token === "string" && token ? `Board: ${token}` : "(no board token)";
  }
  if (source === "lever") {
    const slug = config.company_slug;
    return typeof slug === "string" && slug ? `Company: ${slug}` : "(no company slug)";
  }
  const roles = config.roles;
  if (Array.isArray(roles)) {
    const validRoles = roles.filter((role): role is string => typeof role === "string");
    if (validRoles.length > 0) return validRoles.join(" / ");
  }
  if (typeof config.query === "string" && config.query) return config.query;
  return "(no query)";
}
