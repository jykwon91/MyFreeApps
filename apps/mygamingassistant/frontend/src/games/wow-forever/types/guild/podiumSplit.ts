import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

/** A board's shown entries, split into the podium cards and the rows below. */
export interface PodiumSplit {
  podium: LeaderboardEntry[];
  rest: LeaderboardEntry[];
}
