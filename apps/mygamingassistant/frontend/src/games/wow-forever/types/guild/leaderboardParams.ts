import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";

/** The guild leaderboard's URL state. */
export interface LeaderboardParams {
  board: LeaderboardBoard;
  /** The character slug to highlight (`?me=`, set by the guild link on a character page); "" for none. */
  me: string;
  setBoard: (id: string) => void;
}
