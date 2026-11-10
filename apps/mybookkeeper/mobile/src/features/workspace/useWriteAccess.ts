import type { WriteAccess } from "../../types/WriteAccess";
import { useActiveWorkspace } from "./useActiveWorkspace";

/**
 * Whether this member may change things. The app's WorkspaceGate only renders screens once the active
 * workspace is known, so "loading" is the brief moment before that. The server enforces it either way.
 */
export function useWriteAccess(): WriteAccess {
  const workspace = useActiveWorkspace();
  if (workspace === null) return "loading";
  return workspace.org_role === "viewer" ? "denied" : "allowed";
}
