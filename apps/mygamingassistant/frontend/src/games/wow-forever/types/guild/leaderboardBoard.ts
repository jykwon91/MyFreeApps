import type { LeaderboardSource } from "@/games/wow-forever/types/guild/leaderboardSource";

/** One guild leaderboard. */
export interface LeaderboardBoard {
  /** Its `?board=` value. */
  id: string;
  label: string;
  /** The picker group it's listed under. */
  group: string;
  source: LeaderboardSource;
  /** Lowest number first (fewest deaths). */
  ascending: boolean;
  /** Only characters at the level cap are ranked (a fresh alt would top "fewest deaths"). */
  maxLevelOnly: boolean;
}
