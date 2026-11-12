import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { LEADERBOARD_PARAMS } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { positiveWholeNumber } from "@/games/wow-forever/lib/guild/positiveWholeNumber";
import type { FactionParam } from "@/games/wow-forever/types/guild/factionParam";

/** The faction standing board's faction, kept in `?faction=`; changing it replaces the history entry and keeps the other params. */
export function useFactionParam(): FactionParam {
  const [params, setParams] = useSearchParams();
  const faction = positiveWholeNumber(params.get(LEADERBOARD_PARAMS.faction));
  const setFaction = useCallback(
    (id: number | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (id === null) next.delete(LEADERBOARD_PARAMS.faction);
          else next.set(LEADERBOARD_PARAMS.faction, String(id));
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { faction, setFaction };
}
