import { useCallback } from "react";
import { useLiveSearchParams } from "@platform/ui";
import { AUCTION_PROFESSION_PARAM, AUCTION_RECIPE_PARAM } from "@/games/wow-forever/data/auctionHouse/auctionHouseParams";
import { isCraftingProfession } from "@/games/wow-forever/lib/guideProfession";
import { parseRecipeParam } from "@/games/wow-forever/lib/auctionHouse/parseRecipeParam";
import type { AuctionMaterialFilter } from "@/games/wow-forever/types/auctionHouse/auctionMaterialFilter";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

/**
 * The Auction house page's "Profession" and "Recipe" filters, in the URL.
 * A new profession drops the recipe. Picking a recipe adds a history entry,
 * so Back returns to the materials list; everything else replaces.
 */
export function useAuctionMaterialFilter(): AuctionMaterialFilter {
  const [params, setParams] = useLiveSearchParams();
  const rawProfession = params.get(AUCTION_PROFESSION_PARAM);
  const profession = isCraftingProfession(rawProfession) ? rawProfession : null;
  const recipe = profession ? parseRecipeParam(params.get(AUCTION_RECIPE_PARAM)) : null;

  const setProfession = useCallback(
    (next: CraftingProfession | null) => {
      setParams(
        (prev) => {
          if (next) prev.set(AUCTION_PROFESSION_PARAM, next);
          else prev.delete(AUCTION_PROFESSION_PARAM);
          prev.delete(AUCTION_RECIPE_PARAM);
          return prev;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const setRecipe = useCallback(
    (next: number | null) => {
      setParams(
        (prev) => {
          if (next === null) prev.delete(AUCTION_RECIPE_PARAM);
          else prev.set(AUCTION_RECIPE_PARAM, String(next));
          return prev;
        },
        { replace: next === null },
      );
    },
    [setParams],
  );

  return { profession, recipe, setProfession, setRecipe };
}
