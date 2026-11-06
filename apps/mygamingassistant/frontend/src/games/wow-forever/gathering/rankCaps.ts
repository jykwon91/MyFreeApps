import type { CappedRank } from "@/games/wow-forever/types/gathering/cappedRank";
import type { GatheringRank } from "@/games/wow-forever/types/gathering/gatheringRank";

/**
 * One line on the rank to train next: "Train Journeyman now (from 50), or you
 * stop at 75." / "At 125, train Expert — you stop at 150." Null with no skill.
 */
export function rankAdvice(ranks: readonly GatheringRank[], skill: number | null, label: string): string | null {
  if (skill === null) return null;
  const last = ranks[ranks.length - 1];
  if (skill >= last.cap) return `${label} is maxed at ${last.cap}.`;
  const index = ranks.findIndex((r) => r.cap >= skill);
  const next = ranks[index + 1];
  if (!next) return `${last.name} takes you the rest of the way, to ${last.cap}.`;
  const cap = ranks[index].cap;
  if (next.trainAt <= skill) return `Train ${next.name} now (from ${next.trainAt}), or you stop at ${cap}.`;
  return `At ${next.trainAt}, train ${next.name} — you stop at ${cap} without it.`;
}

/** Your skill sits exactly on a rank's cap and a higher rank exists: the rank to train next. Else null. */
export function cappedRank(ranks: readonly GatheringRank[], skill: number | null): CappedRank | null {
  if (skill === null) return null;
  const index = ranks.findIndex((r) => r.cap === skill);
  if (index < 0 || index === ranks.length - 1) return null;
  return { current: ranks[index], next: ranks[index + 1] };
}
