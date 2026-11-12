import type { Talent } from "@/games/wow-forever/types/talents/talent";
import type { TalentRankLine } from "@/games/wow-forever/types/talents/talentRankLine";

function line(talent: Talent, rank: number, label: string): TalentRankLine {
  return {
    rank,
    label,
    text: talent.ranks[rank - 1] ?? "",
    classicText: talent.classicRanks?.[rank - 1] ?? null,
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

/**
 * All ranks for the compare view: every rank 1–max, each labelled "Rank N".
 * Shows Classic text wherever it changed, so the detail panel can present a
 * full side-by-side without hiding anything.
 */
export function allTalentRankLines(talent: Talent): TalentRankLine[] {
  return talent.ranks.map((_text, i) => line(talent, i + 1, `Rank ${i + 1}`));
}
