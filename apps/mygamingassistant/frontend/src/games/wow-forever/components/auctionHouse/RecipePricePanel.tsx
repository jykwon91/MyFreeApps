import { useMemo } from "react";
import RecipeMaterialRow from "@/games/wow-forever/components/auctionHouse/RecipeMaterialRow";
import RecipeMaterialsHeader from "@/games/wow-forever/components/auctionHouse/RecipeMaterialsHeader";
import RecipeMakesText from "@/games/wow-forever/components/auctionHouse/RecipeMakesText";
import RecipeTotals from "@/games/wow-forever/components/auctionHouse/RecipeTotals";
import RecipeRef from "@/games/wow-forever/components/recipes/RecipeRef";
import GameIcon from "@/games/wow-forever/components/shared/GameIcon";
import ItemIcon from "@/games/wow-forever/components/shared/ItemIcon";
import { recipeIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { recipePriceBreakdown } from "@/games/wow-forever/lib/auctionHouse/professionMaterials";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { CraftingProfession, CraftRecipe } from "@/games/wow-forever/types/crafting";

interface RecipePricePanelProps {
  recipe: CraftRecipe;
  /** Links the recipe name to its full recipe. */
  profession: CraftingProfession;
  prices: AuctionPrices;
}

/** One recipe's materials at this house's prices, what a craft costs and what it sells for. */
export default function RecipePricePanel({ recipe, profession, prices }: RecipePricePanelProps) {
  const breakdown = useMemo(() => recipePriceBreakdown(recipe, prices.byId), [recipe, prices]);
  return (
    <section className="space-y-3" data-testid="recipe-panel">
      <div>
        <h2 className="text-lg font-semibold">
          <RecipeRef profession={profession} spell={recipe.spell} name={recipe.name} className="inline-flex items-center gap-2">
            <GameIcon icon={recipeIcon(recipe)} size={32} alt="" />
            {recipe.name}
          </RecipeRef>
        </h2>
        <p className="text-sm text-muted-foreground">
          <RecipeMakesText recipe={recipe} /> · turns yellow at skill {recipe.yellow}
        </p>
      </div>
      <RecipeMaterialsHeader />
      <ul className="space-y-3 sm:space-y-0">
        {breakdown.lines.map((line) => (
          <RecipeMaterialRow key={line.itemId} line={line} />
        ))}
      </ul>
      {recipe.tool && <p className="text-sm text-muted-foreground">Also needs a <ItemIcon itemId={recipe.tool.id} />
          {recipe.tool.name} in your bags (not used up).</p>}
      <RecipeTotals breakdown={breakdown} />
    </section>
  );
}
