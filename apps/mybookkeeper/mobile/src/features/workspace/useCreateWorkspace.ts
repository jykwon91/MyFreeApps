import { organizationsApi, useCreateOrganizationMutation } from "@mybookkeeper/api-client/store/organizationsApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
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
  const [create] = useCreateOrganizationMutation();
  const switchTo = useSwitchWorkspace();
  const { showToast } = useToast();

  return async (name) => {
    let createdId: string;
    try {
      createdId = (await create({ name }).unwrap()).id;
    } catch (error) {
      return createFailure(error);
    }
    // The list has to hold the new one before it's opened, or the gate would move off it as unknown.
    const latest = await dispatch(organizationsApi.endpoints.listOrganizations.initiate(undefined, { forceRefetch: true, subscribe: false }));
    const workspaces = latest.data;
    if (!workspaces?.some((workspace) => workspace.id === createdId)) {
      showToast(MESSAGES.createdNotOpened(name), "error");
      return null;
    }
    switchTo(createdId, workspaces);
    showToast(MESSAGES.created(name));
    return null;
  };
}
