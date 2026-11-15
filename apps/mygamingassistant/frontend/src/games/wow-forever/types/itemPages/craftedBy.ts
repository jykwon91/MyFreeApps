import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { CraftedReagent } from "@/games/wow-forever/types/itemPages/craftedReagent";

/** A recipe (Forever client) that makes the item. */
export interface CraftedBy {
  profession: CraftingProfession;
  /** Skill to learn the recipe. */
  skill: number;
  spell: number;
  recipe: string;
  reagents: readonly CraftedReagent[];
  /** "start" (known from the start), "trainer", "item" (a pattern / plans), "quest" / "npc" (Classic's), or "" when unknown. */
  learn: string;
  /** Who teaches it: the pattern / plans / formula ("item"), the quest titles ("quest") or the NPC names ("npc"). */
  learnItem: string;
}
