import { useEffect, useState } from "react";
import { loadQuestSeen } from "@/games/wow-forever/lib/quests/loadQuestSeen";

const EMPTY_SET: ReadonlySet<number> = new Set();

/**
 * The set of quest ids the operator has seen in the Forever client.
 * Returns an empty set while loading or on error (graceful degradation — the
 * "Seen in game" badge simply won't show until the file is ready).
 */
export function useQuestSeen(): { seenIds: ReadonlySet<number> } {
  const [seenIds, setSeenIds] = useState<ReadonlySet<number>>(EMPTY_SET);

  useEffect(() => {
    let live = true;
    loadQuestSeen().then(
      (file) => {
        if (!live) return;
        setSeenIds(new Set(Object.keys(file.quests).map(Number)));
      },
      () => {
        // Graceful degradation: "Seen in game" filters and badges just don't show.
      },
    );
    return () => {
      live = false;
    };
  }, []);

  return { seenIds };
}
