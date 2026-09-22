import { useMemo } from "react";
import { useGetGamesQuery } from "@/store/gamesApi";
import type { Game } from "@/types/game";

/** Companion games (WoW Forever) have no maps or lineups. */
export function isLineupGame(game: Game): boolean {
  return game.kind !== "companion";
}

/**
 * `useGetGamesQuery` limited to lineup games — use it for every game picker in
 * the lineup library (upload, review, sources, packages) so a companion game
 * never shows up where a map must be chosen.
 */
export function useLineupGames() {
  const query = useGetGamesQuery();
  const data = useMemo(() => query.data?.filter(isLineupGame), [query.data]);
  return { ...query, data };
}
