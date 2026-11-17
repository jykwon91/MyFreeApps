import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { DropRecipeSort } from "@/games/wow-forever/types/dropRecipes/dropRecipeSort";
import type { DropRecipeSource } from "@/games/wow-forever/types/dropRecipes/dropRecipeSource";
import type { DropRecipeTrade } from "@/games/wow-forever/types/dropRecipes/dropRecipeTrade";

/** The Drop-only recipes page's choices, kept in the URL. */
export interface DropRecipeFilters {
  profession: CraftingProfession;
  /** Null = every kind of source. */
  source: DropRecipeSource | null;
  sort: DropRecipeSort;
  /** Null = tradeable and bind-on-pickup both. */
  trade: DropRecipeTrade | null;
  /** The character whose known recipes are crossed out (a Blizzard slug); null = no character. */
  character: string | null;
}
