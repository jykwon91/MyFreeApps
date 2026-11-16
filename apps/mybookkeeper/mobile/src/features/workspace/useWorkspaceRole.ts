import { useListOrganizationsQuery } from "@mybookkeeper/api-client/store/organizationsApi";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import { useSelector } from "react-redux";
import type { RootState } from "../../lib/store";

/**
 * My role in the open workspace: from the loaded list, or, while that can't be reached, the role the
 * server gave last time, saved with the workspace. Null when neither says.
 */
export function useWorkspaceRole(): OrgRole | null {
  const { data } = useListOrganizationsQuery();
  const activeId = useSelector((state: RootState) => state.workspace.activeId);
  const remembered = useSelector((state: RootState) => state.workspace.remembered);
  if (data) return data.find((workspace) => workspace.id === activeId)?.org_role ?? null;
  return remembered?.id === activeId ? (remembered?.role ?? null) : null;
}
