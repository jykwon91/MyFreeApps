import type { SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { CraftingByProfession } from "@/games/wow-forever/types/auctionHouse/craftingByProfession";
import type { ItemCategoryIndex } from "@/games/wow-forever/types/auctionHouse/itemCategoryIndex";
import type { FoodRecord } from "@/games/wow-forever/types/food";

/** Everything the Recipes page joins into one list. */
export interface RecipeBookInput {
  crafting: CraftingByProfession;
  foods: readonly FoodRecord[];
  /** Cooked item id -> Cooking skill a Classic trainer asks. */
  foodTrainerSkills: Readonly<Record<string, number>>;
  /** Cooking recipe sources, keyed by the food's id. */
  foodSources: SourceLookup;
  categories: ItemCategoryIndex;
}
