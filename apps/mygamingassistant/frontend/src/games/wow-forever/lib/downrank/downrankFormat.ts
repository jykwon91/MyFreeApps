import type { DownrankRank } from "@/games/wow-forever/types/downrank/downrankRank";

const MS_PER_SECOND = 1000;

function seconds(ms: number): string {
  return `${Number((ms / MS_PER_SECOND).toFixed(2))} sec`;
}

/** "2.5 sec", "Instant", or for a spell that ticks "Instant, over 15 sec". */
export function formatCast(rank: DownrankRank): string {
  const cast = rank.castMs > 0 ? seconds(rank.castMs) : "Instant";
  if (!rank.periodic) return cast;
  return `${cast}, over ${seconds(rank.periodic.ticks * rank.periodic.periodMs)}`;
}

/** A whole amount, e.g. "1,204". */
export function formatAmount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** An efficiency figure with `digits` decimals, e.g. "2.41". */
export function formatRate(value: number, digits: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A share as a percent, e.g. 0.857 → "85.7%". */
export function formatShare(value: number): string {
  return `${Number((value * 100).toFixed(1))}%`;
}
