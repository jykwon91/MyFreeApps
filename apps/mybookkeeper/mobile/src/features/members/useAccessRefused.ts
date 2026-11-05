import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { useToast } from "@platform/mobile";
import { useCallback } from "react";
import { MEMBERS_MESSAGES as MESSAGES } from "../../constants/members";
import { useListWorkspacesQuery } from "../workspace/workspaceApi";
import { isNotMemberRefusal } from "./membersDisplay";

/**
 * A 403 here means this phone's idea of my role is out of date, so the workspace list is asked
 * again. Someone removed altogether gets moved along by WorkspaceGate, which says so itself.
 */
export function useAccessRefused(): (error: unknown) => void {
  const { showToast } = useToast();
  const { refetch } = useListWorkspacesQuery();

  return useCallback(
    (error: unknown) => {
      void refetch();
      if (isNotMemberRefusal(error)) return;
      showToast(isDemoRefusal(error) ? MESSAGES.demoNote : MESSAGES.notAllowed, "error");
    },
    [refetch, showToast],
  );
}
