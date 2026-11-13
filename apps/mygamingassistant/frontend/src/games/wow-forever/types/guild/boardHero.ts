import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

/** The leader of one gains board, and who is chasing them. */
export interface BoardHero {
  board: LeaderboardBoard;
  leader: LeaderboardEntry;
  runnerUp: LeaderboardEntry | null;
  /** "Big Sue is 12 HKs behind — defend the crown!" */
  hint: string;
}
