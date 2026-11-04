import { useSelector } from "react-redux";
import type { RootState } from "../../lib/store";
import type { Workspace } from "../../types/Workspace";
import { useListWorkspacesQuery } from "./workspaceApi";

export function useActiveWorkspace(): Workspace | null {
  const { data } = useListWorkspacesQuery();
  const activeId = useSelector((state: RootState) => state.workspace.activeId);
  return data?.find((workspace) => workspace.id === activeId) ?? null;
}
