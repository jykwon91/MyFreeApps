import { formatPoints as points } from "@/games/wow-forever/lib/talents/formatPoints";
import type { TalentBlock } from "@/games/wow-forever/types/talents/talentBlock";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

/** Why a point can't move, in a sentence for the tooltip and the details panel. */
export function talentBlockMessage(block: TalentBlock, tree: TalentTree): string {
  switch (block.kind) {
    case "maxed":
      return "Every rank is taken.";
    case "no-points":
      return "No points left at this level. Raise your level to spend more.";
    case "tier":
      return `Needs ${points(block.pointsNeeded)} more in ${tree.name} first.`;
    case "prereq":
      return `Needs ${points(block.rank)} in ${tree.talents[block.talentIndex].name} first.`;
    case "empty":
      return "No points in it yet.";
    case "dependent":
      return `${tree.talents[block.talentIndex].name} needs these points. Take points out of it first.`;
    case "tier-above":
      return `A talent in row ${block.tier + 1} needs these points to stay open.`;
  }
}
