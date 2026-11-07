import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls to the element the URL's `#hash` names once `ready` (react-router never does:
 * a deep link like `/wow-forever/dungeons/deadmines#boss-edwin-vancleef` loads before its section exists).
 */
export function useScrollToHash(ready: boolean): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || hash.length < 2) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [ready, hash]);
}
