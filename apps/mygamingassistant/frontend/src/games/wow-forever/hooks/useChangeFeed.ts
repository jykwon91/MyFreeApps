import { useCallback, useEffect, useState } from "react";
import { loadChangeCategory } from "@/games/wow-forever/lib/changes/loadChangeCategory";
import type { ChangeCategory } from "@/games/wow-forever/types/changes/changeCategory";
import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";
import type { ChangeFeedState } from "@/games/wow-forever/types/changes/changeFeedState";

interface Loaded {
  category: ChangeCategory;
  attempt: number;
  entries: readonly ChangeEntry[] | null;
}

/** One category's rows (its own lazy chunks, loaded once); loads again on retry after a failure. */
export function useChangeFeed(category: ChangeCategory): ChangeFeedState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    loadChangeCategory(category).then(
      (entries) => live && setLoaded({ category, attempt, entries }),
      () => live && setLoaded({ category, attempt, entries: null }),
    );
    return () => {
      live = false;
    };
  }, [category, attempt]);

  // A category switch shows the skeleton, never the last category's rows.
  if (!loaded || loaded.category !== category) return { status: "loading" };
  if (loaded.entries) return { status: "ready", entries: loaded.entries };
  return { status: "error", retry, retrying: loaded.attempt !== attempt };
}
