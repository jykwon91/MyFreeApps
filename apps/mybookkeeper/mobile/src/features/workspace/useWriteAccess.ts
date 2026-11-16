import type { WriteAccess } from "../../types/WriteAccess";
import { useWorkspaceRole } from "./useWorkspaceRole";

/**
 * Whether this member may change things. The app's WorkspaceGate only renders screens once the active
 * workspace is known, so "loading" is the brief moment before that, or an offline launch whose saved
 * workspace has no role with it, which allows nothing until the list loads. The server enforces it either way.
 */
export function useWriteAccess(): WriteAccess {
  const role = useWorkspaceRole();
  if (role === null) return "loading";
  return role === "viewer" ? "denied" : "allowed";
}
