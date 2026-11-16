import { Link } from "react-router-dom";
import { DETAIL_LINK } from "@/games/wow-forever/components/food/detail/detailStyles";
import { DROP_RECIPES_TEXT } from "@/games/wow-forever/data/dropRecipes/dropRecipesConfig";
import { auctionHouseHref } from "@/games/wow-forever/lib/ask/askGuideLinks";
import { playerPriceFaction } from "@/games/wow-forever/prices/priceFaction";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

interface DropRecipeTradeLineProps {
  recipe: DropRecipe;
  faction: PlayerFaction;
}

/** Bind on pickup: loot it yourself. Tradeable: a link to its price on your faction's Auction House. */
export default function DropRecipeTradeLine({ recipe, faction }: DropRecipeTradeLineProps) {
  if (recipe.bindOnPickup) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="drop-recipe-trade">
        {DROP_RECIPES_TEXT.bindOnPickup}
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" data-testid="drop-recipe-trade">
      <span className="text-muted-foreground">{recipe.random && !recipe.bestChance ? DROP_RECIPES_TEXT.randomTradeable : DROP_RECIPES_TEXT.tradeable}</span>
      <Link to={auctionHouseHref(recipe.item.name, playerPriceFaction(faction))} className={DETAIL_LINK}>
        {DROP_RECIPES_TEXT.checkAuctionHouse}
      </Link>
    </p>
  );
}
