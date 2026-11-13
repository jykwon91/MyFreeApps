import { useSelector } from "react-redux";
import type { RootState } from "../../lib/store";
import type { OrgWithRole } from "@mybookkeeper/api-client/types/organization/OrgWithRole";
import { useListOrganizationsQuery } from "@mybookkeeper/api-client/store/organizationsApi";

export function useActiveWorkspace(): OrgWithRole | null {
  const { data } = useListOrganizationsQuery();
  const activeId = useSelector((state: RootState) => state.workspace.activeId);
  return data?.find((workspace) => workspace.id === activeId) ?? null;
}
