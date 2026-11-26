import type { RecipeItem } from "@/games/wow-forever/types/itemPages/recipeItem";
import type { ItemTooltipData } from "@/games/wow-forever/types/itemPages/itemTooltipData";

/** A recipe item's tooltip: what teaches what, plus the made item's own Forever stats when the files have them. */
export interface RecipeItemTooltipData {
  recipe: RecipeItem;
  product: ItemTooltipData | null;
}
