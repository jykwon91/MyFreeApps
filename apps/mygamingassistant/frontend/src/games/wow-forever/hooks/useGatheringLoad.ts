import { useCallback, useEffect, useState } from "react";
import type { GatheringLoadState } from "@/games/wow-forever/types/gathering/gatheringLoadState";

/**
 * A gathering guide's generated data — loaded only when the guide opens.
 * `load` must be a module-level function: the data reloads when `guide` or `load` changes.
 */
export function useGatheringLoad<G, T>(guide: G, load: (guide: G) => Promise<T>): GatheringLoadState<T> {
  const [result, setResult] = useState<{ guide: G; data: T | null } | null>(null);
  // The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
  const retry = useCallback(() => window.location.reload(), []);

  useEffect(() => {
    let live = true;
    load(guide).then(
      (data) => live && setResult({ guide, data }),
      () => live && setResult({ guide, data: null }),
    );
    return () => {
      live = false;
    };
  }, [guide, load]);

  if (!result || result.guide !== guide) return { status: "loading" };
  if (result.data === null) return { status: "error", retry };
  return { status: "ready", data: result.data };
}
