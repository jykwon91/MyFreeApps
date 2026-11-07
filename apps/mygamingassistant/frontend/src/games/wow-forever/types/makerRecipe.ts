import type { CraftReagent } from "@/games/wow-forever/types/crafting";

/** How another profession makes an item: one craft's reagents, and how many it makes. */
export interface MakerRecipe {
  count: number;
  reagents: CraftReagent[];
}
