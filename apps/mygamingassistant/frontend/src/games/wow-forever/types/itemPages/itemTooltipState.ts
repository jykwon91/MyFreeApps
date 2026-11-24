import type { ITEM_TOOLTIP_STATUS } from "@/games/wow-forever/data/itemPages/itemTooltipStatus";
import type { ItemTooltipData } from "@/games/wow-forever/types/itemPages/itemTooltipData";
import type { RecipeItemTooltipData } from "@/games/wow-forever/types/itemPages/recipeItemTooltipData";

type Status = typeof ITEM_TOOLTIP_STATUS;

/**
 * An item tooltip's data while its shard loads; MISSING = the item isn't in the Forever files;
 * RECIPE = it isn't either, but the profession data knows the recipe it teaches.
 */
export type ItemTooltipState =
  | { status: Status["LOADING"] }
  | { status: Status["ERROR"] }
  | { status: Status["MISSING"] }
  | { status: Status["RECIPE"]; data: RecipeItemTooltipData }
  | { status: Status["READY"]; data: ItemTooltipData };
