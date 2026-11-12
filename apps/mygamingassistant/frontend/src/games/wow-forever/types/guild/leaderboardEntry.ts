import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

/** One ranked member on a leaderboard. */
export interface LeaderboardEntry {
  member: GuildMember;
  value: number;
  /** Competition rank: tied members share it (1, 2, 2, 4). */
  rank: number;
  tied: boolean;
  /** The number as shown ("1,204", "148 / 225", "+3"). */
  display: string;
  /** A line under the name: since when a gain counts ("since Nov 12"); null on other boards. */
  detail: string | null;
}
