import { useSelector } from "react-redux";
import type { RootState } from "@/shared/store";
import type { OrgWithRole } from "@/shared/types/organization/org-with-role";

export function useCurrentOrg(): OrgWithRole | null {
  return useSelector((state: RootState) => {
    const { activeOrgId, organizations } = state.organization;
    if (!activeOrgId) return null;
    return organizations.find((o) => o.id === activeOrgId) ?? null;
  });
}

export function useActiveOrgId(): string | null {
  return useSelector((state: RootState) => state.organization.activeOrgId);
}
