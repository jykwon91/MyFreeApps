import { LEADERBOARD_PODIUM_RANK, LEADERBOARD_PODIUM_SIZE } from "@/games/wow-forever/data/guild/leaderboardConfig";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";
import type { PodiumSplit } from "@/games/wow-forever/types/guild/podiumSplit";

/**
 * The podium: the leading entries ranked in the top 3, at most three cards (a three-way tie for 2nd fills it and
 * the rest of the tie becomes rows). Picked by rank, never by position: two members tied 1st are both gold.
 */
export function splitPodium(entries: readonly LeaderboardEntry[]): PodiumSplit {
  const podium = entries.filter((e) => e.rank <= LEADERBOARD_PODIUM_RANK).slice(0, LEADERBOARD_PODIUM_SIZE);
  return { podium, rest: entries.slice(podium.length) };
}
