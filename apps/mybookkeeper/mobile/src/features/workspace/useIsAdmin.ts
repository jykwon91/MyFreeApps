import { useActiveWorkspace } from "./useActiveWorkspace";

/** Hides what only owners and admins can do. The server enforces it either way. */
export function useIsAdmin(): boolean {
  const workspace = useActiveWorkspace();
  return workspace?.org_role === "owner" || workspace?.org_role === "admin";
}
