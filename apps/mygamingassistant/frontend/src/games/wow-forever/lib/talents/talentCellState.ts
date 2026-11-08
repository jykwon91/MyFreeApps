import { addBlock } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentCellState } from "@/games/wow-forever/types/talents/talentCellState";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

/**
 * A cell's look, as in game: gold when maxed, green with some points, plain
 * when it can take one, greyed while its row or a prerequisite is missing.
 * Running out of points never greys a cell — a higher level would open it.
 */
export function talentCellState(
  trees: readonly TalentTree[],
  build: TalentBuild,
  tree: number,
  talent: number,
  level: number,
): TalentCellState {
  const rank = build[tree][talent];
  const max = trees[tree].talents[talent].ranks.length;
  if (rank >= max) return "maxed";
  if (rank > 0) return "partial";
  const block = addBlock(trees, build, tree, talent, level);
  if (block && (block.kind === "tier" || block.kind === "prereq")) return "locked";
  return "open";
}
