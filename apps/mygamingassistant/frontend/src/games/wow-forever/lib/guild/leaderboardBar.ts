import { LEADERBOARD_BAR_MIN_PERCENT } from "@/games/wow-forever/data/guild/leaderboardConfig";

/** A row's bar width as a share of the leader's number, in percent: never under the minimum, so every row shows one. */
export function barPercent(value: number, leaderValue: number): number {
  if (leaderValue <= 0) return LEADERBOARD_BAR_MIN_PERCENT;
  return Math.min(100, Math.max(LEADERBOARD_BAR_MIN_PERCENT, (value / leaderValue) * 100));
}
