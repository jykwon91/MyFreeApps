import type { OrgWithRole } from "@mybookkeeper/api-client/types/organization/OrgWithRole";
import { organizationsApi } from "@mybookkeeper/api-client/store/organizationsApi";
import { baseApi } from "@platform/core/store/baseApi";
import type { AppDispatch } from "../../lib/store";
import { workspaceChosen } from "./workspaceSlice";

/**
 * Makes `workspaceId` the one every request is sent for, as the website's switchOrg does.
 * The cache isn't keyed by workspace, so all of it goes: mounted screens fetch again for the
 * new one. The list of workspaces is the person's, not the workspace's, so it's put straight
 * back, and the gate keeps the screens mounted instead of reloading the app.
 */
export function switchWorkspace(workspaceId: string, workspaces: readonly OrgWithRole[]) {
  return (dispatch: AppDispatch): void => {
    dispatch(workspaceChosen(workspaceId));
    dispatch(baseApi.util.resetApiState());
    dispatch(
      organizationsApi.util.upsertQueryEntries([{ endpointName: "listOrganizations", arg: undefined, value: [...workspaces] }]),
    );
  };
}
