import type { OrgWithRole } from "@mybookkeeper/api-client/types/organization/OrgWithRole";
import { router } from "expo-router";
import { useDispatch } from "react-redux";
import { WORKSPACE_HOME_ROUTE } from "../../constants/workspace";
import type { AppDispatch } from "../../lib/store";
import { switchWorkspace } from "./switchWorkspace";

/** Opens another workspace and goes Home, since the screen they were on showed the old one. */
export function useSwitchWorkspace(): (workspaceId: string, workspaces: readonly OrgWithRole[]) => void {
  const dispatch = useDispatch<AppDispatch>();
  return (workspaceId, workspaces) => {
    dispatch(switchWorkspace(workspaceId, workspaces));
    router.navigate(WORKSPACE_HOME_ROUTE);
  };
}
