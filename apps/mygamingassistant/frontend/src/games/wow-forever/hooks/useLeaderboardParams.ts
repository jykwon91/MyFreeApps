import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { LEADERBOARD_PARAMS } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { findBoard } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { LeaderboardParams } from "@/games/wow-forever/types/guild/leaderboardParams";

/** The leaderboard's board and highlighted character, kept in the URL; picking a board replaces the history entry. */
export function useLeaderboardParams(): LeaderboardParams {
  const [params, setParams] = useSearchParams();
  const board = useMemo(() => findBoard(params.get(LEADERBOARD_PARAMS.board)), [params]);
  const me = (params.get(LEADERBOARD_PARAMS.me) ?? "").toLowerCase();
  const setBoard = useCallback(
    (id: string) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set(LEADERBOARD_PARAMS.board, id);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { board, me, setBoard };
}
