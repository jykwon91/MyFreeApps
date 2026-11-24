import type { CraftReagent, CraftingProfession } from "@/games/wow-forever/types/crafting";

/** A recipe-teaching item (Pattern, Plans, Formula…) as the profession data describes it. */
export interface RecipeItem {
  itemId: number;
  name: string;
  profession: CraftingProfession;
  /** The skill the recipe needs; an estimate when `estimated` (Classic's pattern, moved as Forever moved the recipe). */
  skill: number;
  estimated: boolean;
  bop: boolean;
  /** What the recipe is called: shown when it makes no item (an enchant). */
  recipeName: string;
  creates: { id: number; name: string } | null;
  reagents: readonly CraftReagent[];
}
