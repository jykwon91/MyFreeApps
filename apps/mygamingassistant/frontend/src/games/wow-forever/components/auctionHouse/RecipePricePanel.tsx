import { useMemo } from "react";
import RecipeMaterialRow from "@/games/wow-forever/components/auctionHouse/RecipeMaterialRow";
import RecipeMaterialsHeader from "@/games/wow-forever/components/auctionHouse/RecipeMaterialsHeader";
import RecipeTotals from "@/games/wow-forever/components/auctionHouse/RecipeTotals";
import { recipePriceBreakdown } from "@/games/wow-forever/lib/auctionHouse/professionMaterials";
import type { AuctionPrices } from "@/games/wow-forever/types/auctionPrices";
import type { CraftRecipe } from "@/games/wow-forever/types/crafting";

interface RecipePricePanelProps {
  recipe: CraftRecipe;
  prices: AuctionPrices;
}

function makesText(recipe: CraftRecipe): string {
  if (!recipe.creates) return "An enchant: it makes no item.";
  return `Makes ${recipe.creates.count} × ${recipe.creates.name}`;
}

/** One recipe's materials at this house's prices, what a craft costs and what it sells for. */
export default function RecipePricePanel({ recipe, prices }: RecipePricePanelProps) {
  const breakdown = useMemo(() => recipePriceBreakdown(recipe, prices.byId), [recipe, prices]);
  return (
    <section className="space-y-3" data-testid="recipe-panel">
      <div>
        <h2 className="text-lg font-semibold">{recipe.name}</h2>
        <p className="text-sm text-muted-foreground">
          {makesText(recipe)} · turns yellow at skill {recipe.yellow}
        </p>
      </div>
      <RecipeMaterialsHeader />
      <ul className="space-y-3 sm:space-y-0">
        {breakdown.lines.map((line) => (
          <RecipeMaterialRow key={line.itemId} line={line} />
        ))}
      </ul>
      {recipe.tool && <p className="text-sm text-muted-foreground">Also needs a {recipe.tool.name} in your bags (not used up).</p>}
      <RecipeTotals breakdown={breakdown} />
    </section>
  );
}
