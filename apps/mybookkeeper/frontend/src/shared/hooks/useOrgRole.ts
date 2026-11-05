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

export function useCanWrite(): boolean {
  const role = useOrgRole();
  return role !== "viewer";
}
