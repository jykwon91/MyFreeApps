import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import { useCurrentOrg } from "./useCurrentOrg";

export function useOrgRole(): OrgRole | null {
  const org = useCurrentOrg();
  return org?.org_role ?? null;
}

export function useIsOrgAdmin(): boolean {
  const role = useOrgRole();
  return role === "owner" || role === "admin";
}

// Unknown role means no write access. RequireOrg only renders pages once the
// role is known, so this never hides controls from a member who can write.
export function useCanWrite(): boolean {
  const role = useOrgRole();
  return role !== null && role !== "viewer";
}
