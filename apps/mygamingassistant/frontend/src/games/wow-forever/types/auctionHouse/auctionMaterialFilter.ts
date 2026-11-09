import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

/** The Auction house page's profession / recipe filter, read from the URL. */
export interface AuctionMaterialFilter {
  /** `?prof=`; anything that isn't a crafting profession = none. */
  profession: CraftingProfession | null;
  /** `?recipe=` spell id, only with a profession. Not checked against the recipes here. */
  recipe: number | null;
  setProfession: (next: CraftingProfession | null) => void;
  setRecipe: (next: number | null) => void;
}
