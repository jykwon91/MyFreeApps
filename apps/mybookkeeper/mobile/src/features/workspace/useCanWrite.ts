import { useWriteAccess } from "./useWriteAccess";

/** Hides what a viewer can't do. The server enforces it either way. */
export function useCanWrite(): boolean {
  return useWriteAccess() === "allowed";
}
