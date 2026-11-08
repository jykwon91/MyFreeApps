import type { TalentGridDirection } from "@/games/wow-forever/types/talents/talentGridDirection";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

const DIRECTION_OF_KEY: Readonly<Record<string, TalentGridDirection>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** The grid direction an arrow key means, or null for any other key. */
export function talentGridDirection(key: string): TalentGridDirection | null {
  return DIRECTION_OF_KEY[key] ?? null;
}

/**
 * The talent the arrow key moves to from `from`: the nearest one that way.
 * Up / down go to the next row with a talent, the closest column first;
 * left / right stay in the row. Null when there's nothing that way.
 */
export function nextTalentIndex(tree: TalentTree, from: number, direction: TalentGridDirection): number | null {
  const here = tree.talents[from];
  let best: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  tree.talents.forEach((t, i) => {
    if (i === from) return;
    const rows = t.tier - here.tier;
    const columns = t.column - here.column;
    let score: number;
    if (direction === "left" || direction === "right") {
      if (rows !== 0 || (direction === "right" ? columns <= 0 : columns >= 0)) return;
      score = Math.abs(columns);
    } else {
      if (direction === "down" ? rows <= 0 : rows >= 0) return;
      score = Math.abs(rows) * 10 + Math.abs(columns);
    }
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
