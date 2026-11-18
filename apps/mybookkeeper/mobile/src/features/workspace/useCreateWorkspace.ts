import { organizationsApi, useCreateOrganizationMutation, useListOrganizationsQuery } from "@mybookkeeper/api-client/store/organizationsApi";
import type { OrgWithRole } from "@mybookkeeper/api-client/types/organization/OrgWithRole";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { useToast } from "@platform/mobile";
import { useDispatch } from "react-redux";
import { WORKSPACE_MESSAGES as MESSAGES } from "../../constants/workspace";
import type { AppDispatch } from "../../lib/store";
import { isServerAnswer } from "../../utils/isServerAnswer";
import { useSwitchWorkspace } from "./useSwitchWorkspace";

function createFailure(error: unknown): string {
  if (httpStatus(error) === 403) return MESSAGES.demoRefused;
  return isServerAnswer(error) ? MESSAGES.couldntCreateServer : MESSAGES.couldntCreate;
}

/** Creates a workspace and opens it. Resolves to the problem to show on the form, or null once it's done with. */
export function useCreateWorkspace(): (name: string) => Promise<string | null> {
  const dispatch = useDispatch<AppDispatch>();
  // What was there before the create, so a lost answer can be checked for a new one.
  const { currentData: known } = useListOrganizationsQuery();
  const [create] = useCreateOrganizationMutation();
  const switchTo = useSwitchWorkspace();
  const { showToast } = useToast();

  function latestWorkspaces(): Promise<readonly OrgWithRole[] | undefined> {
    return dispatch(organizationsApi.endpoints.listOrganizations.initiate(undefined, { forceRefetch: true, subscribe: false })).then((latest) => (latest.isSuccess ? latest.data : undefined));
  }

  function open(name: string, createdId: string, workspaces: readonly OrgWithRole[] | undefined): null {
    // The list has to hold the new one before it's opened, or the gate would move off it as unknown.
    if (!workspaces?.some((workspace) => workspace.id === createdId)) {
      showToast(MESSAGES.createdNotOpened(name), "error");
      return null;
    }
    switchTo(createdId, workspaces);
    showToast(MESSAGES.created(name));
    return null;
  }

  /** The server commits before it answers, so a lost answer or a proxy error can mean it was created. A new one with this name is that one. */
  async function settle(name: string, error: unknown, before: readonly OrgWithRole[] | undefined): Promise<string | null> {
    const workspaces = before ? await latestWorkspaces() : undefined;
    if (!before || !workspaces) return MESSAGES.createUnsure;
    const landed = workspaces.find((workspace) => workspace.name === name && !before.some((old) => old.id === workspace.id));
    return landed ? open(name, landed.id, workspaces) : createFailure(error);
  }

  return async (name) => {
    let createdId: string;
    try {
      createdId = (await create({ name }).unwrap()).id;
    } catch (error) {
      // Cancelled by a cache reset (sign-out): nothing was lost, and nobody is left to tell.
      if (isCancelledRequest(error)) return null;
      return writeOutcome(error) === "unknown" ? settle(name, error, known) : createFailure(error);
    }
    return open(name, createdId, await latestWorkspaces());
  };
}
