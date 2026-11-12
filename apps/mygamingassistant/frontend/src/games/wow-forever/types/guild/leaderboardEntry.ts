import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

/** One ranked member on a leaderboard. */
export interface LeaderboardEntry {
  member: GuildMember;
  value: number;
  /** Competition rank: tied members share it (1, 2, 2, 4). */
  rank: number;
  tied: boolean;
  /** The number as shown ("1,204", "148 / 225", "+3", "Honored"). */
  display: string;
  /** A line under the name: since when a gain counts ("since Nov 12"), progress in a standing ("6,550 / 12,000"); null on other boards. */
  detail: string | null;
}
