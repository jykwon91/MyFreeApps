import { useCallback, useRef } from "react";
import type { RegisterHomeRefetch } from "./HomeRefreshContext";

/** The refetches the cards on Home have registered, and one call that runs them all. */
export function useHomeRefreshRegistry(): { register: RegisterHomeRefetch; refetchCards: () => Promise<unknown[]> } {
  const refetches = useRef(new Set<() => unknown>());
  const register = useCallback<RegisterHomeRefetch>((refetch) => {
    refetches.current.add(refetch);
    return () => {
      refetches.current.delete(refetch);
    };
  }, []);
  const refetchCards = useCallback(() => Promise.all([...refetches.current].map((refetch) => refetch())), []);
  return { register, refetchCards };
}
