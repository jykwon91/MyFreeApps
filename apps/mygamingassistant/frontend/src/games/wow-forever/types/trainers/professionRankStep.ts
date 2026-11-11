import type { CraftingRank } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { MilestoneStep } from "@/games/wow-forever/data/professions/professionTypes";

/** One rank on a profession's ladder: the skill it takes, the level it needs and the cap it gives. */
export interface ProfessionRankStep {
  name: string;
  /** Skill you need to train it ("50"). */
  skill: string;
  /** Character level it needs; null when nothing is known to gate it. */
  level: number | null;
  /** The new skill cap; null when the source puts it in the milestone text instead. */
  cap: number | null;
  /** Who trains it, for a crafting or First Aid rank (a trainer list, a book, a quest or a dungeon NPC). */
  craftingRank: CraftingRank | null;
  /** How you get it, for a Cooking or Fishing milestone. */
  milestone: MilestoneStep | null;
}
