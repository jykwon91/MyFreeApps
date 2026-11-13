import { ORGANIZATION_HEADER } from "@platform/core/constants/organizationHeader";
import { bearerHeader } from "@platform/mobile";
import { useSelector } from "react-redux";
import type { RootState } from "../../lib/store";
import { session } from "../../lib/session";

/** For requests the API client can't make: an image view and a file download. */
export function useFileRequestHeaders(): () => Record<string, string> {
  const workspaceId = useSelector((state: RootState) => state.workspace.activeId);
  return () => ({
    ...bearerHeader(session),
    ...(workspaceId ? { [ORGANIZATION_HEADER]: workspaceId } : {}),
  });
}
