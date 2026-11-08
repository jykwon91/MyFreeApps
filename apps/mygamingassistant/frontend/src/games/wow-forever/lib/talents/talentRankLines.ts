import type { Talent } from "@/games/wow-forever/types/talents/talent";
import type { TalentRankLine } from "@/games/wow-forever/types/talents/talentRankLine";

/** The text of a rank that isn't in the Forever client yet and has no Classic text either. */
export const RANK_NOT_IN_FILES = "This rank isn't in the game files yet.";

/** The note on a Classic fallback rank of a talent Forever changed elsewhere. */
export const FOREVER_CHANGED_OTHER_RANKS = "Forever changed other ranks of this talent; this rank's Forever value isn't known yet.";

function line(talent: Talent, rank: number, label: string): TalentRankLine {
  const text = talent.ranks[rank - 1] ?? null;
  const fallbackText = text === null ? (talent.classicFallback?.[rank - 1] ?? null) : null;
  return {
    rank,
    label,
    text,
    classicText: talent.classicRanks?.[rank - 1] ?? null,
    fallbackText,
    changedElsewhere: fallbackText !== null && isChangedInForever(talent),
  };
}

/**
 * What a talent's tooltip shows at `rank` points: the rank you have (none at
 * 0) and the next one (none at the max) — as in game.
 */
export function talentRankLines(talent: Talent, rank: number): TalentRankLine[] {
  const lines: TalentRankLine[] = [];
  if (rank > 0) lines.push(line(talent, rank, `Rank ${rank}`));
  if (rank < talent.ranks.length) lines.push(line(talent, rank + 1, rank === 0 ? `Rank 1` : `Next rank (${rank + 1})`));
  return lines;
}

/** Whether any rank of the talent changed from Classic. */
export function isChangedInForever(talent: Talent): boolean {
  return talent.classicRanks?.some((text) => text !== null) ?? false;
}
