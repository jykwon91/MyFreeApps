import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

/** A board where 1st and 2nd are close. */
export interface HotRace {
  board: LeaderboardBoard;
  leader: LeaderboardEntry;
  runnerUp: LeaderboardEntry;
  /** The distance between them, in the board's number (above 0). */
  gap: number;
  /** The gap as a share of the larger number: how close the race really is. */
  relativeGap: number;
}
