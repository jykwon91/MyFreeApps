import { useSyncExternalStore } from "react";
import { hasAiPermission, subscribeToAiPermission } from "./aiPermission";

export function useHasAiPermission(): boolean {
  return useSyncExternalStore(subscribeToAiPermission, hasAiPermission);
}
