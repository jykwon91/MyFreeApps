import { useActiveWorkspace } from "./useActiveWorkspace";

/**
 * Hides what only owners and admins can do. Only the loaded list counts, never the role saved for
 * offline: none of it works offline, and a saved role may be out of date. The server enforces it either way.
 */
export function useIsAdmin(): boolean {
  const workspace = useActiveWorkspace();
  return workspace?.org_role === "owner" || workspace?.org_role === "admin";
}
