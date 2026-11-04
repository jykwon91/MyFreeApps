import { useActiveWorkspace } from "./useActiveWorkspace";

/** Hides what a viewer can't do. The server enforces it either way. */
export function useCanWrite(): boolean {
  const workspace = useActiveWorkspace();
  return workspace !== null && workspace.org_role !== "viewer";
}
