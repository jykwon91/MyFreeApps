import { useContext, useEffect, useRef } from "react";
import { HomeRefreshContext } from "./HomeRefreshContext";

/**
 * A card calls this with a refetch of every query it reads, so a pull to refresh on
 * Home reaches it. Adding a query to a card means adding it here, in the same file.
 */
export function useRegisterHomeRefetch(refetch: () => unknown): void {
  const register = useContext(HomeRefreshContext);
  const latest = useRef(refetch);
  useEffect(() => {
    latest.current = refetch;
  });
  useEffect(() => register(() => latest.current()), [register]);
}
