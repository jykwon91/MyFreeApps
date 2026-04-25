import type { OrgRole } from "@/shared/types/organization/org-role";
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
